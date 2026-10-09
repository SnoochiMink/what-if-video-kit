# Synthesized audio

Generate the entire soundtrack in Web Audio. No files means the page stays self-contained and
works from `file://`, and — far more importantly — the sound is **driven by simulation state**,
so it is automatically in sync with the picture. Wind that rises because the wind actually rose
is worth more than any sample library.

Browsers block audio until a user gesture, so build the graph on the Play click.

## Graph

```js
const ctx = new AudioContext();
const comp = ctx.createDynamicsCompressor();      // tames impact spikes; essential once
comp.threshold.value = -16; comp.ratio.value = 4; // dozens of one-shots overlap
const master = ctx.createGain(); master.gain.value = 0.9;
master.connect(comp); comp.connect(ctx.destination);
```

Two looping noise buffers cover almost everything:

```js
function noiseBuffer(ctx, sec, type) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
  }
  return b;
}
```

White noise is bright — rain, glass, debris, hiss. Brown noise is weighted to the low end —
rumble, thunder, collapse, roar. Loop both forever and ride gain and filter frequency.

## Continuous beds

Every bed is a loop through a filter into a gain, with gain and filter frequency slewed from
simulation state each frame. Use `setTargetAtTime`, never `value =`, or you get clicks.

```js
const set = (p, v, tc = 0.12) => p.setTargetAtTime(v, ctx.currentTime, tc);

sampleField(cameraPos, w);
const wind = Math.hypot(w.x, w.z);
set(windGain.gain, Math.min(0.75, Math.pow(wind / 55, 1.4) * 0.75) + 0.01);
set(windBandpass.frequency, 250 + wind * 14);      // pitch rises with speed
```

| Bed | Recipe |
|---|---|
| Wind | white → bandpass, centre 250 + speed·14 Hz |
| Howl | white → narrow bandpass (Q≈9) at 700–1500 Hz, swept slowly; the "whistle" |
| Roar / rumble | brown → lowpass 90–350 Hz, plus a 34 Hz sine for sub |
| Rain | white → highpass 1.8 kHz → lowpass 8 kHz |
| Fire | brown → lowpass ~400 Hz, plus random crackle one-shots |
| Water flow | brown → bandpass ~300 Hz, plus white → highpass for surface detail |

Scale the roar by **proximity squared** and by event strength. The approach of a tornado or a
wave is mostly an audio event — the sound arrives long before the thing does, and that is where
the dread comes from.

## One-shots

```js
function oneShot(buf, at, dur, vol, filt, freq, q = 0.8, rate = 1) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const f = bq(filt, freq, q), g = gain(0);
  s.connect(f); f.connect(g); g.connect(master);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);     // never ramp to exactly 0
  s.start(at, Math.random() * 2); s.stop(at + dur + 0.05);    // random offset = varied texture
}
```

| Event | Recipe |
|---|---|
| Impact | white → bandpass 250–1150 Hz, 0.12–0.27 s |
| Glass | 5 × white → highpass 4–7 kHz, scattered over 0.25 s |
| Wood crack | white → bandpass 1.5 kHz (snap) + brown → lowpass 300 Hz (body) |
| Collapse | brown → lowpass 260 Hz over 1.6 s + white → bandpass 700 Hz |
| Explosion | brown → lowpass 140 Hz over 2.5 s + white crack + a long rolling tail |
| Thunder | optional close crack, then brown → lowpass sweeping 380→110 Hz over 3.5 s, plus 4 random rolls |
| Siren | two detuned oscillators (saw + square) → resonant lowpass, wailing on a 7.5 s cycle |

## Make the simulation drive it

This is the whole point. Have physics push events onto a queue and let audio consume it:

```js
EVENTS.push({ type: 'impact', x, y, z, e: Math.min(1, speed / 30) });
```

Then every frame, with the camera as the listener:

```js
for (const e of EVENTS) {
  const d = Math.hypot(cam.x - e.x, cam.y - e.y, cam.z - e.z);
  if (d > 260 || budget-- <= 0) continue;              // cap voices per frame
  const at = ctx.currentTime + d / 343;                // speed of sound
  const vol = e.e * clamp(1 - d / 260, 0, 1);
  if (e.type === 'impact') oneShot(white, at, 0.15, 0.6 * vol, 'bandpass', 250 + Math.random()*900, 1.2);
}
EVENTS.length = 0;
```

Budget the voices. At peak destruction thousands of impacts occur per second; without a cap the
mix turns to white noise and the compressor pumps. Six per frame, nearest first, is plenty.

Delay by distance. A collapse two blocks away arriving half a second late is a detail nobody
consciously notices and everybody feels. For thunder it is the entire effect.

## Silence is a tool

The strongest moment in a disaster edit is usually a drop to near-silence just before impact —
wind only, no music, no roar — then everything at once. Keyframe a master duck into the mix
around the climax.

Also use audio to mark narrative: birds before the storm that stop when the sky turns; a siren
that winds down as the power fails; a single dog barking in the aftermath.

## When playback stops

When paused or fast-forwarding, ramp master gain to 0 and **clear the event queue**, or every
queued event fires simultaneously the moment you resume.
