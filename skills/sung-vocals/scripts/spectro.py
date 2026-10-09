"""spectro.py [t0] [t1] -- spectrogram of audio/vocal_dry.wav with the score's notes overlaid (verification)."""
import sys, json, re, wave
from pathlib import Path
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT = Path(__file__).resolve().parent.parent
t0, t1 = float(sys.argv[1]), float(sys.argv[2])
out = sys.argv[3] if len(sys.argv) > 3 else str(ROOT / 'tools' / 'shots' / 'spectro.png')
w = wave.open(str(ROOT / 'audio' / 'vocal_dry.wav')); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
x = x[int(t0 * sr):int(t1 * sr)]
S = json.loads(re.search(r'/\*JSON\*/(.*?)/\*END\*/', (ROOT / 'js/song.js').read_text('utf-8'), re.S).group(1))
B = 60 / S['bpm']
fig, ax = plt.subplots(2, 1, figsize=(18, 8), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
ax[0].specgram(x, NFFT=2048, Fs=sr, noverlap=1792, xextent=(t0, t1), cmap='magma', vmin=-120)
ax[0].set_ylim(0, 6000)
for L in S['lines']:
    b = L['bar'] * 4
    for s, m, d in L['notes']:
        if s:
            f = 440 * 2 ** ((m + S['transpose'] - 69) / 12)
            ax[0].plot([b * B, (b + d) * B], [f, f], 'c-', lw=2, alpha=.8)
            ax[0].text(b * B, 5600, s, color='w', fontsize=8)
        b += d
for k in range(int(t0 / B), int(t1 / B) + 1):
    ax[0].axvline(k * B, color='w', lw=.3 if k % 4 else 1, alpha=.5)
tt = np.arange(len(x)) / sr + t0
ax[1].plot(tt, x, lw=.3); ax[0].set_xlim(t0, t1)
Path(out).parent.mkdir(exist_ok=True); plt.tight_layout(); plt.savefig(out, dpi=80)
print(out)
