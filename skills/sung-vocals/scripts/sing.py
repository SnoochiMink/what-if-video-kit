"""
sing.py -- render Rupert's vocal from js/song.js.

    tools/.venv/Scripts/python -I -X utf8 tools/sing.py [--root=DIR] [--voice=FILE.onnx] [--dur=SECONDS]

  --root   project folder holding js/song.js (default: this script's parent's parent)
  --voice  Piper voice model (default: <root>/tools/voices/en_US-ryan-high.onnx)
  --dur    length of the rendered track in seconds (default: SONG.duration or 70)

Speech-to-singing, the technique behind early concatenative singing synths:

  1. Piper (neural TTS, en_US "ryan") SPEAKS each lyric line and reports
     how many samples every phoneme took.
  2. The phonemes are grouped into syllables: one vowel nucleus each,
     consonant clusters split by onset maximisation.
  3. WORLD (pyworld) analyses the speech into a spectral envelope (the
     vowel, the voice), an aperiodicity map (breath, fricatives) and F0.
  4. Every syllable is WARPED onto its note: onset consonants at natural
     speed, landing just BEFORE the beat the way a singer places them;
     the vowel stretched to fill the note (head and tail at natural
     speed, so diphthongs glide at the end rather than smearing); the
     coda released at the end of the note.
  5. F0 is thrown away and replaced by the melody: scoops into notes,
     portamento between legato notes, delayed vibrato on held notes.
  6. The whole song is resynthesised in ONE continuous WORLD pass, so
     there are no joins and no clicks between syllables.

Outputs:
  audio/vocal.wav       stereo 44.1 kHz: lead + chorus double + room
  audio/vocal_dry.wav   mono lead, no effects (for your own mix)
  js/lipsync.js         60 fps jaw / lip-round / lip-wide track, from the
                        same render, so the mouth is in sync by construction
"""
import json, re, sys, wave
from pathlib import Path
import numpy as np
import pyworld as pw
from piper import PiperVoice
from piper.config import SynthesisConfig

def _arg(name, default=None):
    for a in sys.argv[1:]:
        if a.startswith(f'--{name}='): return a.split('=', 1)[1]
    return default
ROOT = Path(_arg('root', Path(__file__).resolve().parent.parent)).resolve()
VOICE = Path(_arg('voice', ROOT / 'tools' / 'voices' / 'en_US-ryan-high.onnx'))
FP = 5.0                       # WORLD frame period, ms
FPS_LIP = 60

# ---------------------------------------------------------------- score
src = (ROOT / 'js' / 'song.js').read_text(encoding='utf-8')
SONG = json.loads(re.search(r'/\*JSON\*/(.*?)/\*END\*/', src, re.S).group(1))
BEAT = 60.0 / SONG['bpm']
DUR = float(_arg('dur', SONG.get('duration', 70.0)))
TRANS = SONG.get('transpose', 0)

# ---------------------------------------------------------------- phonemes
VOW = set('aeiouɪʊəɐæɑɔɛʌɜɚɝᵻɒɵɘɞ')
MOD = set('ːˈˌ')
PAUSE = set(' ,.!?;:—…-')
DIPH = {'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'əʊ', 'ɪə', 'eə', 'ʊə'}
OPEN = {'a': 1.0, 'ɑ': 1.0, 'æ': 0.95, 'ʌ': 0.85, 'ɔ': 0.85, 'ɒ': 0.9, 'ɐ': 0.8,
        'ɛ': 0.72, 'e': 0.62, 'ə': 0.55, 'ɜ': 0.6, 'ɚ': 0.5, 'ɝ': 0.5, 'o': 0.62,
        'ɪ': 0.42, 'i': 0.32, 'ʊ': 0.4, 'u': 0.3, 'ᵻ': 0.4}
ROUND = set('oʊuɔɒw')
WIDE = set('iɪeæɛ')
CLOSED = set('mbp')        # lips shut


def syllabify(ph):
    """ph: list of (char, s0, s1). Returns syllables [(onset0, nuc0, nuc1, coda1, vowel_char)]."""
    # nuclei
    nuc = []                                 # [start_idx, end_idx_excl, vowels]
    cur = None
    for i, (c, _, _) in enumerate(ph):
        if c in VOW or c in MOD:
            if c in 'ˈˌ':
                if cur and cur[2]:
                    nuc.append(cur); cur = None
                if cur is None: cur = [i, i + 1, '']
                cur[1] = i + 1
                continue
            if c == 'ː':
                if cur: cur[1] = i + 1
                continue
            # a vowel
            if cur is None:
                cur = [i, i + 1, c]
            elif cur[2] == '':
                cur[1] = i + 1; cur[2] = c
            elif len(cur[2]) == 1 and (cur[2] + c) in DIPH and ph[i - 1][0] != 'ː':
                cur[1] = i + 1; cur[2] += c
            elif c == 'ɚ' and cur[2] in ('aɪ', 'aʊ'):  # "fire", "viral", "hour": one sung syllable
                cur[1] = i + 1
            else:
                nuc.append(cur); cur = [i, i + 1, c]
        else:
            if cur is not None:
                if cur[2]: nuc.append(cur)
                cur = None
    if cur is not None and cur[2]: nuc.append(cur)
    # An unstressed short i/ɪ straight before another vowel is a GLIDE, the
    # "y" in "mil-yun": it is the onset of the next syllable, not a syllable.
    k = 0
    while k + 1 < len(nuc):
        a, b, v = nuc[k]
        gap = [ph[i][0] for i in range(b, nuc[k + 1][0])]
        stressed = any(ph[i][0] in 'ˈˌ' for i in range(a, b))
        if v in ('i', 'ɪ') and not stressed and k > 0 and all(c == 'ʲ' for c in gap):
            nuc.pop(k)
            continue
        k += 1

    sylls = []
    for k, (a, b, v) in enumerate(nuc):
        prev_end = nuc[k - 1][1] if k else 0
        nxt_start = nuc[k + 1][0] if k + 1 < len(nuc) else len(ph)
        # onset: consonants between previous nucleus and this one, after the split
        between = list(range(prev_end, a))
        if k == 0:
            on = [i for i in between if ph[i][0] not in PAUSE]
            # only the run after the last pause
            pz = [i for i in between if ph[i][0] in PAUSE]
            if pz: on = [i for i in between if i > pz[-1]]
        else:
            pz = [i for i in between if ph[i][0] in PAUSE]
            if pz:
                on = [i for i in between if i > pz[-1]]
            else:
                cons = between
                on = cons if len(cons) <= 1 else cons[1:]
        # coda: consonants after this nucleus up to the next onset
        after = list(range(b, nxt_start))
        pz = [i for i in after if ph[i][0] in PAUSE]
        if pz:
            cod = [i for i in after if i < pz[0]]
        elif k + 1 < len(nuc):
            cod = after[:1] if len(after) >= 2 else []
        else:
            cod = after
        o0 = ph[on[0]][1] if on else ph[a][1]
        c1 = ph[cod[-1]][2] if cod else ph[b - 1][2]
        sylls.append(dict(o0=o0, n0=ph[a][1], n1=ph[b - 1][2], c1=c1, v=v,
                          onph=[ph[i][0] for i in on], coph=[ph[i][0] for i in cod]))
    return sylls


# ---------------------------------------------------------------- TTS
voice = PiperVoice.load(str(VOICE), include_alignments=True)
SR = voice.config.sample_rate
cfg = SynthesisConfig(length_scale=1.05, noise_scale=0.45, noise_w_scale=0.6)

lines = []
for li, L in enumerate(SONG['lines']):
    audio, ph, off = [], [], 0
    for ch in voice.synthesize(L['tts'], syn_config=cfg, include_alignments=True):
        a = ch.audio_float_array.astype(np.float64)
        al = ch.phoneme_alignments
        tot = sum(int(x.num_samples) for x in al)
        scale = len(a) / max(1, tot)
        pos = 0.0
        for x in al:
            n = int(x.num_samples) * scale
            if x.phoneme not in ('^', '$', '_'):
                ph.append((x.phoneme, off + pos, off + pos + n))
            pos += n
        audio.append(a); off += len(a)
    x = np.concatenate(audio)
    phs = [(c, s0 / SR, s1 / SR) for c, s0, s1 in ph]
    syl = syllabify(phs)
    notes = [n for n in L['notes'] if n[0] is not None]
    if len(syl) != len(notes):
        print(f'!! line {li} "{L["tts"]}": {len(syl)} sung syllables vs {len(notes)} notes')
        print('   phonemes:', ''.join(c for c, _, _ in phs))
        print('   nuclei  :', [s['v'] for s in syl])
        sys.exit(1)
    f0, t = pw.harvest(x, SR, frame_period=FP, f0_floor=60, f0_ceil=400)
    sp = pw.cheaptrick(x, f0, t, SR)
    ap = pw.d4c(x, f0, t, SR)
    lines.append(dict(f0=f0, sp=sp, ap=ap, syl=syl, notes=notes, bar=L['bar']))
    print(f'line {li:2d}: {len(syl)} syllables  {"".join(c for c, _, _ in phs)}')

NB = lines[0]['sp'].shape[1]

# ---------------------------------------------------------------- timeline
# Absolute note list with vowel onsets on the beat.
events = []
for li, L in enumerate(lines):
    b = L['bar'] * 4
    k = 0
    for s, m, d in SONG['lines'][li]['notes']:
        if s is not None:
            events.append(dict(line=li, syl=L['syl'][k], midi=m + TRANS, T0=b * BEAT, T1=(b + d) * BEAT, txt=s))
            k += 1
        b += d
for i, e in enumerate(events):
    nx = events[i + 1] if i + 1 < len(events) else None
    e['legato_next'] = bool(nx and abs(nx['T0'] - e['T1']) < 1e-6 and nx['line'] == e['line'])
    pv = events[i - 1] if i else None
    e['legato_prev'] = bool(pv and abs(pv['T1'] - e['T0']) < 1e-6 and pv['line'] == e['line'])

# Segment maps: list of (tgt0, tgt1, src0, src1, line, kind, event)
segs = []
for i, e in enumerate(events):
    s = e['syl']
    od, cd = s['n0'] - s['o0'], s['c1'] - s['n1']
    od = min(od, 0.16); cd = min(cd, 0.16)
    nx = events[i + 1] if i + 1 < len(events) else None
    next_od = min(0.16, nx['syl']['n0'] - nx['syl']['o0']) if (nx and e['legato_next']) else 0.0
    T0, T1 = e['T0'], e['T1']
    Ne = T1 - cd - next_od - (0.0 if e['legato_next'] else 0.03)
    if Ne - T0 < 0.05:                     # squeeze consonants if the note is short
        k = max(0.2, (T1 - T0 - 0.05) / max(1e-3, cd + next_od + 0.03))
        cd *= k; Ne = T1 - cd - next_od * k - 0.01
    Ne = max(Ne, T0 + 0.05)
    L = e['line']
    if od > 0: segs.append((T0 - od, T0, s['o0'], s['o0'] + od, L, 'on', i))
    # nucleus: head and tail at natural speed, the middle stretched
    Ls, Lt = s['n1'] - s['n0'], Ne - T0
    if Lt <= Ls * 1.05:
        segs.append((T0, Ne, s['n0'], s['n1'], L, 'nuc', i))
    else:
        h, tl = 0.18 * Ls, (0.32 if len(s['v']) > 1 else 0.2) * Ls
        segs.append((T0, T0 + h, s['n0'], s['n0'] + h, L, 'nuc', i))
        segs.append((T0 + h, Ne - tl, s['n0'] + h, s['n1'] - tl, L, 'nuc', i))
        segs.append((Ne - tl, Ne, s['n1'] - tl, s['n1'], L, 'nuc', i))
    if cd > 0: segs.append((Ne, Ne + cd, s['c1'] - cd, s['c1'], L, 'co', i))

NF = int(DUR * 1000 / FP) + 1
ft = np.arange(NF) * FP / 1000.0
f0g = np.zeros(NF); spg = np.full((NF, NB), 1e-14); apg = np.ones((NF, NB))
owner = np.full(NF, -1); kind = np.array([''] * NF, dtype=object)
srcT = np.zeros(NF); srcLine = np.full(NF, -1)
for (a, b, s0, s1, L, kd, ei) in segs:
    i0, i1 = int(np.ceil(a * 1000 / FP)), int(np.floor(b * 1000 / FP))
    for fi in range(max(0, i0), min(NF - 1, i1) + 1):
        u = (ft[fi] - a) / max(1e-6, b - a)
        st = s0 + (s1 - s0) * u
        LL = lines[L]
        q = st * 1000 / FP
        j = int(np.clip(np.floor(q), 0, len(LL['f0']) - 2)); w = q - j
        spg[fi] = np.exp(np.log(LL['sp'][j] + 1e-16) * (1 - w) + np.log(LL['sp'][j + 1] + 1e-16) * w)
        apg[fi] = LL['ap'][j] * (1 - w) + LL['ap'][j + 1] * w
        voiced = LL['f0'][j] > 0 or LL['f0'][j + 1] > 0 or kd == 'nuc'
        f0g[fi] = 1.0 if voiced else 0.0            # pitch filled in below
        owner[fi] = ei; kind[fi] = kd; srcT[fi] = st; srcLine[fi] = L

# Even out the vowels. Speech trails off at the end of every sentence, so a
# phrase-final held note ("me", "see") came out at a quarter of the level of
# the rest. A singer supports the held note instead: normalise each
# syllable's vowel power to the song's median, then accent lightly.
FUNC = {'the', 'a', 'a-', 'and', 'at', 'to', 'for', 'by', 'it\'s', 'you', 'my', 'me', 'on'}
pw_e = np.zeros(len(events))
for ei in range(len(events)):
    sel = (owner == ei) & (kind == 'nuc')
    pw_e[ei] = np.mean(spg[sel].sum(1)) if sel.any() else 0
target = np.median(pw_e[pw_e > 0])
for ei, e in enumerate(events):
    if pw_e[ei] <= 0: continue
    acc = 1.0
    w = e['txt'].lower().strip(',.!?')
    if w in FUNC: acc *= 0.72
    if abs((e['T0'] / BEAT) % 4) < 1e-6: acc *= 1.2       # downbeat
    if e['T1'] - e['T0'] >= 1.2: acc *= 1.1               # a held note is sung out
    g = np.clip(target * acc / pw_e[ei], 0.25, 9.0)
    spg[owner == ei] *= g

# ---------------------------------------------------------------- melody
rng = np.random.default_rng(7)
drift = np.convolve(rng.normal(0, 1, NF), np.ones(80) / 80, mode='same') * 0.6   # slow cents wander
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
pitch = np.zeros(NF)
amp = np.zeros(NF)
for fi in range(NF):
    ei = owner[fi]
    if ei < 0: continue
    e = events[ei]
    m = float(e['midi'])
    tl = ft[fi] - e['T0']
    if tl < 0.09:
        if e['legato_prev']:                    # portamento from the previous note
            m = events[ei - 1]['midi'] + (m - events[ei - 1]['midi']) * ss((tl + 0.03) / 0.12)
        else:                                   # a scoop up into the note
            m -= 0.8 * (1 - ss((tl + 0.04) / 0.13))
    held = e['T1'] - e['T0']
    if held > 0.55:                             # delayed vibrato on held notes
        dep = 0.32 * ss((tl - 0.28) / 0.35)
        m += dep * np.sin(2 * np.pi * 5.3 * tl + ei)
    if not e['legato_next'] and held > 0.6:     # phrase-end fall
        m -= 0.35 * ss((ft[fi] - (e['T1'] - 0.14)) / 0.12)
    m += drift[fi] * 0.06
    pitch[fi] = hz(m)
    # loudness: quick attack, gentle swell, soft release
    a = ss(tl / 0.05 + 0.6) * (1.0 + 0.08 * ss(tl / 0.4)) * (1.0 - 0.25 * ss((ft[fi] - e['T1'] + 0.2) / 0.2))
    a *= 1.12 if 4 <= e['line'] <= 7 else (1.18 if e['line'] == 12 else 1.0)    # chorus and finale lift
    amp[fi] = a
f0g = np.where(f0g > 0, pitch, 0.0)

def render(f0, gainshift=1.0):
    sp = spg * (amp[:, None] ** 2 + 1e-9) * gainshift
    return pw.synthesize(f0, sp, apg, SR, frame_period=FP)

lead = render(f0g)
# Chorus double: a second take, a few cents off and a hair late.
rng2 = np.random.default_rng(11)
det = 2 ** ((np.convolve(rng2.normal(0, 1, NF), np.ones(60) / 60, mode='same') * 0.25 + 0.07) / 12)
dbl = render(f0g * det)
lag = int(0.014 * SR); dbl = np.concatenate([np.zeros(lag), dbl])[:len(lead)]

# breaths before each line
breath = np.zeros_like(lead)
for li, L in enumerate(SONG['lines']):
    t0 = L['bar'] * 4 * BEAT - 0.36
    n = int(0.3 * SR); i0 = int(t0 * SR)
    if i0 < 0: continue
    nz = rng.normal(0, 1, n)
    spec = np.fft.rfft(nz); f = np.fft.rfftfreq(n, 1 / SR)
    spec *= np.exp(-((f - 1600) / 1400) ** 2) + 0.4 * np.exp(-((f - 4200) / 1800) ** 2)
    nz = np.fft.irfft(spec, n)
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    seg = nz * env
    breath[i0:i0 + n] += seg / (np.abs(seg).max() + 1e-9) * 0.035

# ---------------------------------------------------------------- mix
def up2(x):                       # 22.05 -> 44.1 kHz, band-limited
    X = np.fft.rfft(x)
    Y = np.zeros(len(x) + 1, dtype=complex)
    Y[:len(X)] = X
    return np.fft.irfft(Y, 2 * len(x)) * 2

def fftconv(a, b):
    n = len(a) + len(b) - 1; N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, N) * np.fft.rfft(b, N), N)[:n]

chorus_mask = np.zeros(len(lead))
for li in (4, 5, 6, 7, 12):
    sp_ = [s for s in events if s['line'] == li]
    i0, i1 = int((sp_[0]['T0'] - 0.3) * SR), int((sp_[-1]['T1'] + 0.3) * SR)
    chorus_mask[i0:i1] = 1
chorus_mask = np.convolve(chorus_mask, np.ones(2000) / 2000, mode='same')

dry = lead + breath
# gentle compression: block RMS -> gain, smoothed
blk = 512
rms = np.sqrt(np.convolve(dry ** 2, np.ones(blk) / blk, mode='same') + 1e-9)
thr = np.percentile(rms[rms > 1e-3], 70) if np.any(rms > 1e-3) else 1
g = np.where(rms > thr, (thr / rms) ** 0.45, 1.0)
g = np.convolve(g, np.ones(1024) / 1024, mode='same')
dry = dry * g
dry_out = dry / (np.abs(dry).max() + 1e-9) * 0.89

L_ = dry + dbl * g * 0.42 * chorus_mask
R_ = dry + np.roll(dbl, int(0.006 * SR)) * g * 0.42 * chorus_mask
L_, R_ = up2(L_), up2(R_)
SR2 = SR * 2
# room: decorrelated exponential tails, darker as they decay
def ir(seed):
    r = np.random.default_rng(seed)
    n = int(1.7 * SR2); t = np.arange(n) / SR2
    x = r.normal(0, 1, n) * np.exp(-t * 6.9 / 1.5)
    out = np.zeros(n); acc = 0.0
    for i in range(0, n, 256):                     # one-pole lowpass whose cutoff falls with time
        a = 0.15 + 0.8 * min(1, t[i] / 1.2)
        seg = x[i:i + 256]
        y = np.empty_like(seg)
        for k in range(len(seg)):
            acc = acc * a + seg[k] * (1 - a); y[k] = acc
        out[i:i + 256] = y
    out[:int(0.018 * SR2)] = 0                     # pre-delay
    return out / np.sqrt(np.sum(out ** 2))
wl, wr = fftconv(L_, ir(1))[:len(L_)], fftconv(R_, ir(2))[:len(R_)]
L_ = L_ + wl * 0.16; R_ = R_ + wr * 0.16
pk = max(np.abs(L_).max(), np.abs(R_).max()) + 1e-9
L_, R_ = L_ / pk * 0.89, R_ / pk * 0.89

def write(path, chans, sr):
    data = np.stack(chans, 1) if len(chans) > 1 else chans[0][:, None]
    data = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(data.shape[1]); w.setsampwidth(2); w.setframerate(sr); w.writeframes(data.tobytes())

(ROOT / 'audio').mkdir(exist_ok=True)
n_out = int(DUR * SR2)
pad = lambda x, n: np.concatenate([x, np.zeros(max(0, n - len(x)))])[:n]
write(ROOT / 'audio' / 'vocal.wav', [pad(L_, n_out), pad(R_, n_out)], SR2)
write(ROOT / 'audio' / 'vocal_dry.wav', [pad(up2(dry_out), n_out)], SR2)

# ---------------------------------------------------------------- lipsync
# Jaw from the actual loudness of the lead, shaped by the vowel being sung;
# lips shut on m/b/p, round on o/u/w, wide on i/e.
env = np.sqrt(np.convolve(lead ** 2, np.ones(int(SR / FPS_LIP)) / int(SR / FPS_LIP), mode='same'))
env = env / (np.percentile(env[env > 1e-4], 95) + 1e-9)
NL = int(DUR * FPS_LIP)
jaw, rnd, wid = np.zeros(NL), np.zeros(NL), np.zeros(NL)
for k in range(NL):
    t = k / FPS_LIP
    fi = min(NF - 1, int(round(t * 1000 / FP)))
    ei = owner[fi]
    if ei < 0: continue
    e = events[ei]; s = e['syl']
    loud = min(1.0, env[min(len(env) - 1, int(t * SR))]) ** 0.7
    v = s['v']
    op = OPEN.get(v[0], 0.5)
    if kind[fi] == 'nuc' and len(v) > 1:            # diphthong closes toward its second vowel
        u = (t - e['T0']) / max(1e-3, e['T1'] - e['T0'])
        op = op + (OPEN.get(v[1], 0.4) - op) * ss((u - 0.55) / 0.4)
    jaw[k] = loud * op
    ph_ = s['onph'] if kind[fi] == 'on' else (s['coph'] if kind[fi] == 'co' else [])
    if any(c in CLOSED for c in ph_): jaw[k] *= 0.05
    if any(c in 'fv' for c in ph_): jaw[k] *= 0.25
    rnd[k] = 1.0 if (v[0] in ROUND or any(c in 'w' for c in ph_)) else 0.0
    wid[k] = 1.0 if v[0] in WIDE else 0.0
sm = lambda a, n: np.convolve(a, np.ones(n) / n, mode='same')
jaw, rnd, wid = sm(jaw, 3), sm(rnd, 5), sm(wid, 5)
q = lambda a: ','.join(str(int(round(v * 100))) for v in a)
(ROOT / 'js' / 'lipsync.js').write_text(
    "'use strict';\n// GENERATED by tools/sing.py from the vocal render. Do not edit.\n"
    "// 60 fps, values 0..100: jaw open, lips rounded, lips wide.\n"
    f"const LIPSYNC = {{ fps: {FPS_LIP}, jaw: [{q(jaw)}], round: [{q(rnd)}], wide: [{q(wid)}] }};\n",
    encoding='utf-8')

# ---------------------------------------------------------------- verify
# Re-track the rendered pitch and compare it with the score, note by note.
f0c, tc = pw.harvest(lead, SR, frame_period=10, f0_floor=60, f0_ceil=500)
errs = []
for e in events:
    a, b = e['T0'] + 0.12, e['T1'] - 0.12
    if b - a < 0.08: continue
    sel = (tc > a) & (tc < b) & (f0c > 0)
    if sel.sum() < 3: errs.append((e['txt'], None)); continue
    got = 69 + 12 * np.log2(np.median(f0c[sel]) / 440)
    errs.append((e['txt'], got - e['midi']))
bad = [x for x in errs if x[1] is None or abs(x[1]) > 0.5]
cents = [abs(x[1]) * 100 for x in errs if x[1] is not None]
print(f'pitch check: {len(errs)} notes, median error {np.median(cents):.0f} cents, {len(bad)} off by >50c: {bad[:8]}')
print('wrote audio/vocal.wav, audio/vocal_dry.wav, js/lipsync.js')
