---
name: disaster-animation
description: >
  Build cinematic ~60-second 3D disaster simulations that run in a browser with three.js and
  export to vertical short-form video — "What if a tornado / asteroid / tsunami /
  earthquake / black hole hit your town?". Covers the shared force-field architecture,
  debris physics, threshold-driven destruction, procedural buildings and cities, rigged
  procedural people and crowds, sky and volumetric effects, synthesized Web Audio, camera
  direction, a 9:16 HUD that survives TikTok's UI, and frame-exact offline MP4 export (no
  screen recording). Use this skill whenever the user wants
  a "what if" video, a disaster or catastrophe animation, a destruction or physics simulation
  in three.js, a procedural city or crowd, a tornado/earthquake/tsunami/flood/meteor/volcano/
  wildfire/hurricane/space-disaster scene, a 9:16 vertical animation for TikTok, Reels or
  Shorts, or wants to extend, debug or improve an existing browser disaster animation — even
  if they only say something like "animate a meteor wiping out a city" or "make my simulation
  look better".
---

# Disaster animation engine

These videos live or die on one thing: **a believable chain of cause and effect**. A funnel
drawn next to debris that is animated separately reads as fake instantly. A funnel whose wind
field *is* the thing throwing the debris, bending the trees, and failing the roofs reads as
real even when the art is simple boxes. Everything below serves that.

The same engine covers every disaster. Only the force field, the visual signature, and the
destruction order change. A tornado is a vortex field; an earthquake is a ground-displacement
field; a tsunami is a moving water surface plus a drag field; an asteroid impact is a blast
wave plus a thermal pulse. Write the shared layers once, swap the field.

---

## Rule 0: build the eye before you build the scene

You cannot art-direct what you cannot see, and you will be tempted to write a thousand lines
of beautiful simulation code that renders a black rectangle. Before writing any scene code,
stand up a headless screenshot harness so you can render any instant of the timeline to a PNG
and actually look at it.

```bash
node tools/shoot.mjs 12 28 41        # writes tools/shots/t_00012.png etc.
```

This is not optional polish — it is the single highest-leverage thing in this skill. Nearly
every real bug in this genre is visual, not thrown: a camera inside a tree, a funnel the size
of the sky, people sinking through the lawn, a ground texture that silently stopped tiling.
None of those raise an exception. You find them by looking.

`scripts/shoot.mjs` is a ready-to-use harness. Copy it into the project's `tools/`, run
`npm i puppeteer-core` there, and from then on: **after every meaningful change, render two or
three frames and read them back.** Read `references/verification.md` before your first render;
it covers the `?shot=` contract, software-WebGL flags, debug cameras, and reading render stats.

---

## Project layout

```
<Disaster>/
├── index.html          thin shell: canvas, HUD markup, script tags in dependency order
├── style.css           9:16 stage, HUD typography in cqw units
├── lib/three.min.js    vendored, so the page works offline from file://
├── js/
│   ├── core.js         seeded RNG, easing, keyframe tracks, noise (JS + GLSL), geometry merge
│   ├── field.js        THE FORCE FIELD — storm/quake/wave state over time + sampling function
│   ├── physics.js      debris pools, rigid bodies, dust; integrates against the field
│   ├── world.js        terrain, roads, buildings, props, vegetation + damage thresholds
│   ├── people.js       rigged humans, gaits, action scripts, crowds
│   ├── sky.js          sky dome, clouds, volumetrics, particles, lighting, weather
│   ├── audio.js        Web Audio synthesis driven by simulation state
│   ├── director.js     camera shots, captions, counters, end card
│   └── main.js         fixed-step loop, seeking, shot mode, grain, supersampling
└── tools/shoot.mjs     headless preview harness
```

Plain `<script>` tags in dependency order, no bundler. It keeps the page openable straight
from `file://`, which is what makes the headless harness and the user's own preview trivial.

---

## The simulation contract

Four properties make the whole workflow possible. Honour them in `main.js` and everything else
gets easier.

**Deterministic.** All randomness comes from seeded generators (`mulberry32`), never
`Math.random()` in simulation code. Two separate streams: one for building the world, one for
run-time events. A given timestamp must always produce the identical frame, or your
screenshots are lying to you and you cannot compare before/after.

**Fixed timestep.** Simulate at exactly 1/60 s regardless of render framerate, accumulating
real elapsed time. Variable `dt` makes drag and spring integration explode at low framerates
and silently changes the result at high ones.

**Seekable by fast-forward.** `?shot=41` runs the simulation from 0 to 41 s as fast as the CPU
allows, then renders one frame. Because the sim is deterministic and fixed-step, that frame is
*exactly* what playback shows at 41 s. This is what lets you inspect the climax without
watching 40 seconds of lead-in every time.

**Render and simulate are separate.** `stepSim()` advances state; `render()` only reads it.
Then fast-forwarding is just `stepSim()` in a loop with rendering skipped.

```js
const DT = 1 / 60;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) { acc += dt; let n = 0; while (acc >= DT && n < 4) { stepSim(); acc -= DT; n++; }
                 if (n === 4) acc = 0; }        // drop time rather than spiral on a slow frame
  render(playing ? dt : 0);
  requestAnimationFrame(loop);
}
```

---

## Build order

Each stage ends with a render. Do not stack two unverified stages; when something looks wrong
you want exactly one suspect.

**1 — Field.** Write `field.js` first: the disaster's state over time (keyframed), and a
`fieldAt(point, out)` sampling function. Everything else reads this. Verify by printing values,
not pixels. See `references/forces.md` and the relevant `references/disasters/*.md`.

**2 — World.** Terrain, roads, buildings, vegetation. Render a wide establishing frame. It
should already look like a place worth destroying. See `references/architecture.md`.

**3 — Physics.** Debris pools and rigid bodies that read the field. Render mid-event and
confirm debris moves *with* the visual effect, not merely near it. See
`references/destruction.md`.

**4 — Destruction.** Threshold-driven failure of buildings and props. Render before/during/
after. See `references/destruction.md`.

**5 — People.** The rig, gaits and action scripts. Render close frames — people are where
uncanny errors hide. See `references/people.md`.

**6 — Sky, light and the image pipeline.** A linear HDR render tone mapped once in post, a
graded image, a physically based sky with the sun where it really was, and image-based
lighting baked from that sky. This is the single biggest "is this real" lever after the field —
a geometrically decent cut was rejected as "bland" until it had these. Do it before polishing
geometry. See `references/rendering.md`, then `references/sky-and-fx.md`.

**7 — Direction, HUD, audio.** Camera shots, captions, counters, end card, synthesized sound.
See `references/direction.md` and `references/audio.md`.

---

## The one architectural decision that matters

**One field, read by everything.** Define the disaster's forces exactly once, then have the
GPU visuals and the CPU physics both sample it.

For a tornado that means the funnel's centre axis is computed by an identical expression in
GLSL and in JavaScript, so the visible funnel and the invisible wind are the same object. For
an earthquake it means one ground-displacement function drives the terrain mesh, the camera
shake, the building sway, and the toppling of every object. For a tsunami it means one water
height field drives the surface mesh, the buoyancy, and the drag on everything it touches.

When those drift apart you get the signature tell of amateur work: debris that spirals around
empty air, or a wave that passes through a car before the car reacts.

Keep the duplicated expression short, put the two copies adjacent in the source, and comment
each as "must match the other". A long shared expression is a maintenance trap; a six-line
axis function is fine.

When the field is too long to duplicate (a water surface with barriers, a reservoir model,
per-site timing), don't duplicate it at all: sample the JS function on the CPU into a data
texture each frame and have the shader read that. The GPU and the physics then agree by
construction. See `references/water.md`.

---

## Performance budget

Target 60 fps on a mid-range laptop at ~1.75× supersampled 1080×1920. Rough budget:

| Thing | Budget | Technique |
|---|---|---|
| Draw calls | < 400 | merge static geometry, instance everything repeated |
| Triangles | < 2 M | low-poly props; detail via texture and silhouette |
| CPU debris | < 25 k | typed-array pools, sleep when resting, recycle slots |
| GPU particles | < 60 k | `Points` with the whole motion computed in the vertex shader |
| Rigged people | < 12 | they are the most expensive per-unit thing on screen |
| Shadow maps | 1 | one directional light, 2048², tight ortho box around the action |

The reliable wins, in order: instance repeated meshes; merge a building's static parts into one
vertex-coloured geometry; pack unique facades and signs into a texture atlas so a whole skyline
is one mesh (a six-material box is six draw calls); put particle motion entirely in the vertex shader so the CPU only
updates uniforms; sleep resting debris and skip it; and sample the field every Nth step for
cheap things like dust and grass rather than every step.

---

## Failure modes this genre reliably produces

Check these when something looks wrong — they account for most of the lost time.

| Symptom | Usual cause |
|---|---|
| Black canvas, no error | shader compile failure, or camera inside geometry — render a debug camera far away |
| "Looks like a cheap animation" though the models are fine | The world ends (street runs into a field, skyline floats over a void) and nothing moves. Build the city to the horizon on one grid and add traffic the field can switch off (`references/city-and-traffic.md`) |
| HUD year digits sink into the line below | Georgia has old-style figures (3 4 5 7 9 descend). Use Cambria or Times with `lnum`, line-height 1, and a real margin |
| Caption words half-faded in exported frames | A CSS `animation` runs on the wall clock. Compute every word's opacity and transform from film time |
| A night or blackout beat is "too dark to see" | Show the failure in daylight (signals dark, steam stops, traffic stops) and keep the light constant |
| Debris orbits empty space | GPU and CPU field expressions have drifted apart |
| Light debris jitters or explodes | linear drag integration; use the exponential form in `references/destruction.md` |
| Characters sink through terrain | motion driven by path *progress* instead of actual position |
| Characters stop just short of a trigger | path followers stop within a tolerance of the final waypoint — put the waypoint past the trigger |
| Texture goes flat or stretched | `CanvasTexture` defaults to `ClampToEdge`; custom geometry UVs are rarely 0..1 |
| A mesh is simply absent, no error | Face winding is inverted, so every triangle is backface-culled. Check the cross product, do not trust your eye. A map on a geometry with no `uv` attribute fails just as silently |
| Several materials render with the wrong shader | `customProgramCacheKey` returning a constant. It must be unique per material, or three.js reuses one compiled program across materials with different attributes |
| A custom `ShaderMaterial` is darker than everything else | It gets neither the ACES tone map nor the sRGB output chunk — those are only injected into built-in materials. Fix it structurally: tone map once in post and have every shader write linear radiance (`references/rendering.md`) |
| Every lit material is black but the sky looks fine | The sky's sun disk overflowed a half-float target to infinity, and the environment prefilter spread it into every lighting sample. Clamp the sky output (`min(c, 40.0)`); confirm with a `?noenv` debug flag |
| Dark materials render as voids | ACES toe + contrast + vignette crush anything under ~0.1 linear. Output the raw value as colour for one frame to confirm, then brighten the material rather than flattening the grade |
| Instanced forest, or all of one prop, randomly missing | `InstancedMesh` frustum-culled by its *base* geometry at the origin (three.js ~r149). `frustumCulled = false` |
| Instanced debris all black | `vertexColors: true` with no colour attribute zeroes `instanceColor`. Use `vertexColors: false`; initialise `instanceColor` to 1 |
| Long roads or walls streaked, or turning sky-blue | Box UVs stretched over kilometres — re-project with world-space UVs; and grazing IBL sheen — lower `envMapIntensity` |
| The camera stares at the world origin | It tracks an object by reading the object's mesh position, which is written *after* the camera updates (and never during fast-forward). Make tracked positions pure functions of time |
| The whole cast dies on a real event where most people lived | A time-skip card moved the clock but not the people. Advance evacuating actors across every skip; check survivors in `simStats()` (`references/real-events.md`) |
| A "fix" changed nothing | The harness crashed and you read last run's PNG, or a patch's anchor text never matched. Check every log line; make patch scripts report missing anchors |
| Your subject is not in the shot you carefully framed | 9:16 at a 45&deg; vertical FOV is only about 25&deg; WIDE. Anything more than ~12&deg; off-axis is out of frame — put subjects ON the camera axis, not near it |
| A frame is black or nonsense, nothing thrown | The camera is inside terrain. Clamp its Y to `groundHeightAt(x, z) + ~1.5` as a standing guard and log when it fires |
| Ground hides anything below it | a plane does not cut a hole — build it as a `Shape` with `holes` |
| Everything slightly fuzzy | rendering at 1× on a 1× display; supersample, and keep film grain under ~4 % |
| Fog colour mismatched in custom shaders | scene fog is linear; in a linear HDR pipeline, mix toward it in linear space before post tone maps everything together |
| Sim behaves differently each run | `Math.random()` leaked into simulation code |
| The render is technically fine but reads as cheap | Captions are too sparse — aim for one roughly every 3 s, near-continuous (`references/direction.md`) |
| The HUD looks like a web page sitting on a render | It is all one sans face. Serif headline + italic serif caption + letterspaced sans support (`references/direction.md`) |
| A fast camera move has no sense of speed | No FOV widening and no radial zoom blur; uniform blur or a locked FOV both read as static (`references/rendering.md` §8) |
| Night or space frames look like holes in the frame | Graded to `#000`. Floor the black around `#101010` (`references/rendering.md` §9) |
| A CSS `filter: blur()` is invisible in exported frames | CSS filters on a canvas are display-only and are not captured. Do it in the shader or via `ctx.filter` |
| The subject is simply not in the POV shot | Something in the corridor between eye and subject: a street tree, lamp post, cart umbrella, a gawker. Down a 9:16 street the subject is a thin central strip; clear that corridor and put extras BESIDE the camera |
| White blotches up the flanks of towers | Side faces that meet the neighbouring building are rendering as "interior/cutaway". Flag party walls in the per-face exterior mask and draw them as blank masonry |
| Every window has a white splotch | The baked IBL has clouds in it and glass mirrors them. Bake the environment with thin cloud (`uCloud ~0.05`), raise window roughness to ~0.25 |
| Distant towers sparkle like snow | Interior-mapped rooms lit in daylight. Keep the lit fraction ~5% and dim (0.35) by day |
| Rubble is pastel blue and pink | Per-CHANNEL random jitter on instance colours, plus linear albedo ~0.35 reading light grey. One jitter per piece, and darker (x0.5-0.75) |
| Low-poly rocks look like loose paper triangles | Jitter applied per vertex INDEX on non-indexed geometry splits faces apart. Jitter by hashed vertex POSITION |
| A giant character's face is a white mask | Glasses lenses at 40x scale mirror the sky. Lens envMapIntensity ~0.1, opacity ~0.05 |
| A giant destroys everything all the time | Its resting pose already overlaps the scenery. Count dead chunks per second in `simStats()` at t = 1 and resize the body or the street until contact is occasional (`disasters/giant.md`) |
| A one-off probe hangs for minutes then times out | A page error stopped the sim before `SHOT_READY`. Make the probe exit on `pageerror` and set `protocolTimeout` |

---

## References

Read the ones you need; they are written to be opened mid-task.

| File | Read it when |
|---|---|
| `references/verification.md` | **first, always** — the preview harness and how to inspect your own work |
| `references/forces.md` | designing the field for any disaster; shared field patterns |
| `references/destruction.md` | debris, rigid bodies, drag integration, damage thresholds, rubble |
| `references/architecture.md` | generating buildings — houses, blocks, towers, bridges, interiors |
| `references/people.md` | the humanoid rig, gaits, action scripts, crowds, panic |
| `references/rendering.md` | **before judging any colour** — HDR pipeline, grading, real sun position, IBL, draw-call atlasing, silent instancing traps |
| `references/real-events.md` | **the user names a real disaster** — confirming scope, sourcing a minute-by-minute record, factual captions, time skips that move people too, the POV camera rig |
| `references/city-and-traffic.md` | **any shot with a street or a horizon** — city to the horizon on one grid, interior-mapped windows, IDM traffic and signals, cars that park for good, a city that responds to the field |
| `references/sky-and-fx.md` | sky, clouds, volumetrics, fire, particles, lighting |
| `references/water.md` | **any disaster involving water** — surfaces, foam, depth cues, barriers that actually hold water back |
| `references/audio.md` | synthesizing the whole soundtrack in Web Audio |
| `references/direction.md` | camera, shot list, captions, counters, hook/retention, TikTok specs |
| `references/disasters/*.md` | the specific disaster: field, signature, destruction order, beats, facts |

Disaster files available: `tornado`, `earthquake`, `tsunami`, `impact` (asteroid/meteor),
`volcano`, `wildfire`, `hurricane`, `cosmic` (black hole, solar flare, rogue planet), `giant`
(a giant character as the disaster: the body is the field, IK footsteps on a beat, destructible
facade chunks, Froude-scaled speed).
`references/disasters/_template.md` shows how to add another — keep the same headings so the
engine layers stay reusable.

**Companion skill.** `pov-acceleration-sim` covers the first-person "never stopped
accelerating" format — a measured relativistic speed curve, act-by-act scene progression, star
aberration and the serif/sans speed HUD. Its blur, saturation-arc, caption-cadence and
typography findings are folded into `rendering.md` §8–9 and `direction.md`; read the skill
itself if the piece is a POV speed run rather than a disaster.

## Scaffolding

`scripts/scaffold.mjs` writes a runnable skeleton — shell, fixed-step loop, HUD, director,
field stub, and the preview harness — so you start from something that already renders and can
iterate immediately instead of debugging a blank page.

```bash
node ~/.claude/skills/disaster-animation/scripts/scaffold.mjs "E:/path/Tsunami" "Tsunami"
```

`scripts/sheet.mjs` renders a list of film times through the export path and tiles them into
one contact sheet (`node tools/sheet.mjs --q="follow=0,170,40" 13 16 19 24`): the cheapest way
to judge a whole sequence of poses or beats in one look.

It also drops in `tools/export.mjs`, which renders the finished piece offline frame by frame
to a 1080x1920 60 fps MP4 — overlays included, no screen recording, no dropped frames. See the
export section of `references/direction.md`.
