# Direction: camera, captions, HUD, retention

The simulation is the easy half. What makes these videos get watched is editing discipline:
where the camera is, how fast you cut, and what the first three seconds do.

## The retention problem

Roughly 65 % of viewers leave in the first three seconds, and the most reliable way to lose
them is a slow establishing shot or a title card. That is a problem, because "wide aerial of a
peaceful town while a title fades in" is the obvious way to open a disaster video and it is
close to the worst option available.

**Cold-open on the payoff.** Open *inside* the disaster — two seconds of the climax, the wedge
filling the frame, the wave hitting the seawall, the shockwave crossing the city — then cut
back to calm with a time stamp. The title can sit over the chaos. The viewer now knows what
they are waiting for and will sit through the setup to see it arrive.

```
0.0–2.2   COLD OPEN: the climax, mid-action, title overlaid
2.2–3.0   hard cut to calm, "11 minutes earlier"
3.0–12    ordinary life; the sky changes; the first wrong detail
12–20     alarm, the run for shelter
20–45     escalation and destruction, cutting faster
45–55     aftermath, quiet, the human beat
55–61     end card with a real fact and a question
```

**Cut every 1.5–3 seconds**, and alternate scale — wide, then close, then ground level, then
overhead. Holding one angle for eight seconds is where viewers leave, no matter what is
happening in the frame.

## Shots

Each shot interpolates a position, a look-at target, and a field of view. A target may be a
function so the camera can track a moving thing.

```js
const tornadoAt = (y) => () => V(FIELD.pos.x + FIELD.lean.x*0.3, y, FIELD.pos.z + FIELD.lean.y*0.3);
const SHOTS = [
  { t0: 15.0, t1: 19.3, p0: V(-25.5,2.5,56.5), p1: V(-21.5,2.9,52.5),
    g0: V(-14.5,1.1,43.5), g1: V(-16,0.7,44.2), f0: 52, f1: 48, hand: 1 },
];
```

Shot grammar worth stealing:

| Shot | Use |
|---|---|
| Eye level, 1.6–1.8 m | the default. Human scale is what makes a disaster frightening |
| Low, 0.6 m, tilted up | makes anything tower over the viewer |
| Shoulder-height following a character | the "someone filmed this" shot |
| High crane looking down into something | reveals a mechanism — a stairwell, a crack, a crater |
| Distant telephoto (fov ~30) | compresses the event against the town and shows true scale |
| Overhead wide | the aftermath shot — damage paths only read from above |

Always put something of known size in frame — a person, a car, a house. Scale without a
reference is invisible.

**Zoom with FOV, move with position.** Narrowing the FOV during a shot adds tension; widening
it releases. Moving the camera toward the subject feels different from zooming, and both at
once is the classic vertigo effect — use it once, at most.

**Widen the FOV with speed.** On any shot where the camera is moving fast — outrunning a surge,
riding debris, falling — drive the FOV off the log of the speed rather than keyframing it:
`fov = 72 + min(42, log10(1 + kmh) * 4.2)`. The widening does most of the speed sensation on its
own, more than the geometry scrolling past does, and it costs nothing. Put the radial blur
centre and the warp centre at the same vanishing point the FOV is opening around.

**Never translate a POV camera through world space.** At the distances these shots cover you
lose float precision within seconds — geometry starts to shear and jitter. Scroll the world past
a fixed camera and recycle it behind. Compress the scroll rate perceptually too
(`min(70, 2 + log10(1 + kmh) * 7)` units/s): literal velocity aliases into noise, and the blur
and FOV are already carrying the speed, so the geometry only has to stay plausible.

## Handheld

A locked-off camera looks like an architectural render. Layer two kinds of motion onto the
interpolated transform:

```js
const shake = clamp((windSpeed - 14) / 55, 0, 1) * 0.03      // the event shakes the operator
            + clamp(1 - distToEvent / 260, 0, 1) * 0.02;
const hand  = 0.006 * S.hand;                                 // slow idle drift
e.y += noise1(t * 0.35) * hand + noise1(t * 11) * shake;      // low + high frequency
e.x += noise1(t * 0.30) * hand * 0.7 + noise1(t * 13) * shake;
e.z += noise1(t * 0.25) * hand * 0.5 + noise1(t *  9) * shake * 0.6;
```

Use smooth noise, never `Math.random()` per frame — random jitter reads as a broken camera, not
a scared human. Scale shake by the actual field strength so it builds with the event for free.

## The 9:16 frame and TikTok's UI

Export at 1080×1920. TikTok draws its own interface on top:

- **Right ~100–180 px**: the action rail (like, comment, share, profile)
- **Bottom ~270 px**: caption, handle, music ticker
- **Top ~12 %**: occasionally covered by search and status

Keep everything that matters inside roughly the central **880×1420**. In practice: counters
inset `left: 6%; right: 16%`, captions inset `left: 7%; right: 18%`, and nothing important
below ~80 % of the height.

Size type in `cqw` (container-query width) units against a `container-type: size` stage, so the
HUD scales identically at preview size and at full 1080×1920. Percentages of a viewport break
the moment the window changes shape.

```css
#stage { aspect-ratio: 9/16; height: 100%; container-type: size; }
#caption { font-size: 6.6cqw; left: 7%; right: 18%; top: 61%; }
```

## Captions

Short, present tense, one idea each. They are read in under a second on a muted phone.

Animate **per word** with a brief stagger, which draws the eye and reads as energy. Write
each word's opacity and transform **from film time** every frame, never with a CSS
`animation` or `transition`. Those run on the wall clock: exported frames caught words
half-faded ("Japan already has" with "has" a ghost), and the same frame rendered twice did
not match.

```js
const a = clamp((t - capStart - k * 0.07) / 0.28, 0, 1);            // word k
const e = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);  // overshoot ease
span.style.opacity = Math.min(1, a * 1.6);
span.style.transform = `translateY(${(1 - a) * 1.5}cqw) scale(${0.7 + 0.3 * e})`;
```

**Numerals.** A big serif counter must use **lining figures**. Georgia only has old-style
figures, where 3 4 5 7 9 hang below the baseline, so "44" and "107" dropped into the line
beneath them. Use Cambria or Times New Roman with `font-variant-numeric: lining-nums
tabular-nums`, `line-height: 1`, and a real bottom margin.

Legibility on any background needs a stroke, not a shadow:

```css
-webkit-text-stroke: 0.55cqw #000; paint-order: stroke fill;
```

Highlight one or two words per caption in the accent colour. It gives the eye an anchor and
raises comprehension at a glance.

**Caption density is a quality tell.** Aim for a new caption roughly every **3 seconds**, with
one on screen almost continuously — a reference 77-second cut carries 22 of them. Sparse
captions over long silent stretches are the single most common reason this format reads as a
cheap imitation, even when the simulation is good. Cross-fade each over ~0.4 s so the track
never flickers empty between lines.

## HUD typography: serif headline, letterspaced sans support

An all-sans HUD looks wrong immediately — it reads as a browser UI sitting on top of a render.
The pairing that reads as a produced piece:

| Element | Face |
|---|---|
| The big number / headline value | high-contrast **serif** (Playfair, Fraunces), subtle drop shadow |
| Caption | **italic serif**, cream `#f3ede3`, centred |
| Eyebrow label above the number | sans, ~0.22em letter-spacing, white 85 % |
| Secondary unit line | sans, grey `#c8c8c8` |
| Milestone / rating badge | sans, uppercase, ~0.18em letter-spacing, grey `#a0a0a0` |
| Handle, top right | sans, white 90 % |

Proportions that work at 9:16 (as fractions of height, so they scale): eyebrow at ~12.5 %, the
number at ~15–18 % with a 33 px cap height at 1024 tall, unit line ~19 %, badge ~21 %, caption
centred at ~68–72 %.

Behind the caption, a **soft dark ellipse** (roughly 500x120 px at 576x1024, peak alpha ~0.24
black at the core, falling to zero within ~60 px vertically) is gentler than a heavy text
stroke and does not thicken the letterforms. Use the ellipse on quiet frames and the stroke
when the caption sits over fire or foam.

## Whiteout as an act transition

Between major phases — leaving the ground, the flash of an impact, the ash cloud arriving —
blow the whole frame to a **flat grey-white (`#b0b0b0`) for about a second** instead of hard
cutting. It covers a total change of location and scale that a cut cannot sell, and the viewer
reads it as the event overwhelming the camera rather than as an edit.

## Hold a readout to make a beat

A counter that **stops** is as dramatic as one that climbs. Pin the headline value at a
threshold for 2–3 seconds at the moment before the turn — the wave height holding at the
seawall crest, the speed pinned at escape velocity — while a *second* readout underneath keeps
moving. The frozen number is what the eye fixes on; the one still climbing is what tells them
it is not over. Build it into the keyframe format: two equal-valued keyframes in a row produce
a hold for free, so holds are authored, not special-cased.

## Live counters

A counter that reports a real simulation value is the most credible element on screen — and the
reason to drive destruction from thresholds rather than keyframes. Good ones:

- **Distance to you** — second person, counts down, turns red inside a threshold
- **Intensity** — wind speed, magnitude, wave height, overpressure, with its rating badge
- **Losses** — homes destroyed, blocks flooded, area burned; incrementing as it actually happens

Use tabular numerals and `white-space: nowrap` so the layout does not jitter as digits change,
and colour-code the rating badge by severity.

## The end card

Hold 4–6 seconds. One real, checkable fact; the source implied by naming the place and date; a
question that invites a comment.

```
REAL FACT
On May 3, 1999, a Doppler on Wheels radar measured winds of about
301 mph inside a tornado near Moore, Oklahoma.
Among the fastest winds ever measured on Earth.

Where would YOU hide? 👇
```

Keep the fact genuinely true and specific. The whole format trades on feeling like a simulation
rather than a cartoon, and one invented statistic in the comments costs the account its
credibility. Each `disasters/*.md` carries verified candidates.

## Exporting the video

Do **not** screen-record, and do not reach for `MediaRecorder` on a canvas stream. The canvas
stream contains only the WebGL canvas, so captions, counters and the end card — all HTML
overlays — are silently dropped. You get a clean 3D render with no text and may not notice
until you watch it back.

Render offline instead. The simulation is deterministic and fixed-step, so it can be advanced
exactly one output frame at a time with no wall clock involved. Every frame gets as long as it
needs, so nothing is dropped and nothing stutters, and a page screenshot captures the HTML
overlays along with the canvas.

```bash
node tools/export.mjs                      # 1080x1920 @ 60fps -> tools/out/video.mp4
node tools/export.mjs --fps=30 --crf=22    # smaller file
node tools/export.mjs --from=35 --to=45    # a range, for checking one change
node tools/export.mjs --keep               # keep the PNG frames
```

The page side is a `?render=1` mode exposing `window.renderFrameAt(n)`:

```js
window.renderFrameAt = n => {
  const target = n / FPS;
  while (simT < target - 1e-6) { stepSim(); EVENTS.length = 0; }
  render(1 / FPS); drawGrain();
};
document.title = 'RENDER_READY';
```

**Use 60 fps.** The sim steps at 1/60 s, so at 60 fps each output frame is exactly one
simulation step — a 1:1 mapping with no resampling. At 30 fps you discard every second
simulated state.

Headless Chrome will use the real GPU if you do not force SwiftShader, which is roughly an
order of magnitude faster: budget about 0.3 s/frame on hardware versus several seconds on the
CPU rasterizer. A 61-second video at 60 fps is 3,660 frames, so about 20 minutes on a GPU.

`ffmpeg` does the encoding. Keep `-pix_fmt yuv420p` and even dimensions or some players and
uploaders will reject the file. `-movflags +faststart` matters for web playback.

## Audio

Audio is synthesized in real time from simulation state, so an offline video render has no
sound. Two options:

- **Capture one real-time pass** — record a `MediaStreamAudioDestinationNode` through
  `MediaRecorder` while the page plays once, then mux with `ffmpeg -i video.mp4 -i audio.webm
  -c:v copy -shortest out.mp4`. Audio is cheap to compute, so it will not glitch even where
  video would.
- **Render it offline** — drive the whole graph through an `OfflineAudioContext`, scheduling
  every parameter change at an explicit time rather than `currentTime`. Fully deterministic and
  frame-exact, but a real refactor of `audio.js`.

Start silent if you plan to score it in an editor anyway.
