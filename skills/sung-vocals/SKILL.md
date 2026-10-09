---
name: sung-vocals
description: Render a SUNG vocal track (real lyrics on a real melody, a natural male or female voice) fully offline, plus a matching lip-sync track, for animations and videos where a character sings. Uses neural TTS (Piper) with phoneme alignments and the WORLD vocoder in a speech-to-singing pipeline — syllables warped onto notes, pitch replaced by the melody with scoops, portamento and vibrato, loudness evened, then one continuous resynthesis with a room and a chorus double. Use whenever the user wants a character to sing, a melody or jingle with words, a singing voice for a video, lip-sync driven by a song, or "add singing" to an animation — even if they only say something like "can he sing while he walks" or "add a nice male melodic voice".
---

# Sung vocals, offline

A speaking TTS voice and a melody are enough to make convincing singing, if you do the four
things a singer does that speech does not: **put the vowel on the beat**, **hold the vowel**
(consonants stay short), **sing the pitch** (not the speech intonation), and **support the held
notes** (speech fades at the end of every sentence; a singer does not).

Built for Rupert's song in `E:\what if tiktok\giant influencer` ("What if an AI influencer
escaped?"). Median pitch error after rendering: 0-1 cents across 40 notes.

## The one rule: one score, read by everything

The score is the clock. Write it once (`js/song.js`, strict JSON between `/*JSON*/` and
`/*END*/` markers so Python can parse it) and have **the vocal render, the character's
choreography, the lip-sync and the on-screen lyrics all read it**. Then nothing can drift: a
footstep on beat 106 and the vowel of "SCRIBE!" on beat 106 are the same number.

```js
const SONG = /*JSON*/{
  "bpm": 96, "transpose": -5, "duration": 70,
  "lines": [
    { "bar": 1, "tts": "Hey New York, look up at me.",
      "notes": [["Hey",62,1],["New",59,0.5],["York,",59,1.5],["look",57,0.5],["up",55,0.5],["at",57,0.5],["me",59,2.5],[null,0,1]] }
  ]
}/*END*/;
```

- `notes`: `[syllable, midi, beats]`; `null` is a rest; a trailing `-` means the word continues
  ("big-", "gest") — the lyric display joins them.
- `tts` is the text the voice actually speaks for that line. Respell it if the syllable count
  comes out wrong; the on-screen lyric is built from `notes`, not from `tts`.
- `transpose` shifts the sounding pitch without rewriting the melody. Keep the sung range near
  the voice's natural register: for a male voice, roughly B2-E4 sounds warm; much higher thins.
- Choose a tempo whose bar divides the video: 96 BPM gives 2.5 s bars, 28 bars = 70 s.

## Setup (once per project)

```bash
python -m venv tools/.venv
tools/.venv/Scripts/python -m pip install numpy pyworld "piper-tts[alignment]" soundfile matplotlib
mkdir tools/voices && cd tools/voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json
```

- **`[alignment]` is required.** Without the `onnx` extra, `phoneme_alignments` is silently
  `None` and there is no way to find the vowels.
- Male voices that work: `en_US-ryan-high`. Browse others at `rhasspy/piper-voices` on Hugging
  Face (lessac, joe, etc.). Pass `--voice=` to use one.
- Run Python with `-I -X utf8`: Windows' cp1252 console cannot print IPA, and `-I` ignores
  `PYTHONIOENCODING`.
- Gitignore `tools/.venv/` and `tools/voices/` (the model is ~120 MB).

Copy `scripts/sing.py` and `scripts/spectro.py` into the project's `tools/`, then:

```bash
tools/.venv/Scripts/python -I -X utf8 tools/sing.py            # -> audio/vocal.wav, audio/vocal_dry.wav, js/lipsync.js
tools/.venv/Scripts/python -I -X utf8 tools/spectro.py 2 13    # spectrogram with the score overlaid
```

## The pipeline (what sing.py does, and why)

1. **Speak each line** with Piper, `include_alignments=True`, giving samples per phoneme.
   `length_scale ~1.05, noise_scale ~0.45` keeps vowels steady.
2. **Syllabify** the phoneme string: one vowel nucleus per syllable; consonants between two
   nuclei go to the next syllable if there is one, else the first goes to the coda (onset
   maximisation: "sub-scribe" = s-ə-b | s-k-ɹ-aɪ-b). Pauses (space, comma) force a split.
   Stress marks (ˈ ˌ) and length (ː) belong to the nucleus. **Fail loudly** if the count does
   not match the notes, printing the phonemes, then fix the rule or respell `tts`.
3. **Analyse** with WORLD (`harvest`, `cheaptrick`, `d4c`) at a 5 ms frame period.
4. **Warp each syllable onto its note**: onset consonants at natural speed ending exactly ON the
   beat; the nucleus stretched to fill the note, with its first ~18% and last ~20-32% at
   natural speed so diphthongs glide at the end instead of smearing across the whole note; the
   coda released before the next onset. Squeeze consonants if the note is too short.
5. **Even out the vowels.** Normalise each syllable's vowel power to the song median, then accent:
   downbeats x1.2, held notes x1.1, function words (the, a, and, to...) x0.72. Without this,
   every phrase-final held note ("me", "see") came out at a quarter of the level of the rest.
6. **Replace F0 with the melody**: voiced frames take the note's pitch; a scoop up from -0.8
   semitone into notes that start a phrase; portamento over ~120 ms between legato notes;
   vibrato 5.3 Hz, depth ramping to ~0.32 semitone, starting ~0.3 s into notes longer than
   0.55 s; a small fall at the end of phrase-final notes; a slow random drift of a few cents.
7. **Resynthesise the whole song in ONE WORLD pass**, so there are no joins or clicks.
8. **Produce it lightly**: breath noise 0.36 s before each line, gentle compression, a chorus
   double on the hook lines (second render a few cents off, 14 ms late, panned), a decaying
   stereo room (~1.5 s), upsample 22.05 -> 44.1 kHz.

## Syllabification traps (each one stopped the render once)

| Symptom | Fix |
|---|---|
| "viral" = 3 syllables (vaɪ-ɚ-əl) | ɚ straight after the diphthong aɪ/aʊ joins it: "fire", "hour", "viral" |
| "million" = 3 syllables (mɪ-li-ən), or with ʲ | an unstressed short i/ɪ directly before another vowel (only ʲ between) is a GLIDE: it becomes the next syllable's onset |
| "going" (ɡoʊɪŋ) merged into one | split vowel runs by diphthong table (aɪ aʊ eɪ oʊ ɔɪ əʊ ɪə eə ʊə), never by run |
| espeak reduces a word you need sung | respell `tts` only ("gonna", "millyun"); keep `notes` as the displayed lyric |

## Verify without ears

You cannot listen; measure instead.

- **Re-track the rendered pitch** with `harvest` and compare each note's median against the
  score; sing.py prints the median error and lists any note off by more than 50 cents.
- **Look at the spectrogram** (`spectro.py t0 t1`): harmonics should be clean horizontal lines
  on the cyan note bars, vowels should start on the beat lines, held notes should show vibrato,
  and the waveform panel should show held notes as loud as short ones.

## Lip-sync

`js/lipsync.js` is written from the same render: per 1/60 s frame, `jaw` (loudness^0.7 x vowel
openness, a > o > e > i/u; diphthongs close toward their second vowel; shut on m/b/p, nearly
shut on f/v), `round` (o, u, w) and `wide` (i, e). Drive a jaw/lip rig with
`mouth(jaw * 1.35, round, wide)`. Because it is derived from the audio itself, it is in sync by
construction.

## Delivering it

- Preview in the browser with an `<audio>` element re-seated to film time whenever it drifts by
  more than 60 ms.
- Mux into the exported MP4 from the same start time as the frames (`-ss FROM -t DUR -i
  vocal.wav -map 0:v -map 1:a -c:a aac -b:a 256k`), so partial exports stay in sync.
- Also hand over `vocal_dry.wav` (mono, no room or double) and the BPM, so the user can score
  music under it and do their own mix.
