# Verification: seeing your own work

You are building something whose only real specification is "does it look right". You cannot
answer that from source code. Set up the ability to look at any frame before you build
anything, and then use it constantly — two or three frames after every meaningful change.

## The `?shot=` contract

The page must support three query parameters. They cost about fifteen lines in `main.js` and
they are what make everything else possible.

| Param | Effect |
|---|---|
| `?shot=41` | fast-forward the sim to 41 s, render one frame, set `document.title = 'SHOT_READY'` |
| `?t=30` | start playback from 30 s (for the human previewing in a real browser) |
| `?cam=x,y,z&look=x,y,z&fov=50` | override the director's camera — inspect anything from anywhere |

```js
const Q = new URLSearchParams(location.search);
const SHOT = Q.has('shot') ? parseFloat(Q.get('shot')) : null;

function fastForward(T) { while (simT < T - 1e-6) { stepSim(); EVENTS.length = 0; } }

if (SHOT != null) {
  fastForward(SHOT);
  render(DT);
  document.title = 'SHOT_READY';          // the harness waits on this, never on a fixed sleep
} else {
  if (START > 0) fastForward(START);
  requestAnimationFrame(loop);
}
```

Two details that matter. Create the renderer with `preserveDrawingBuffer: true` when
`SHOT != null`, or the screenshot can come back empty. And clear the event queue while
fast-forwarding, or thousands of queued sound events fire at once on the first rendered frame.

Also surface errors visually, because a thrown exception otherwise produces a black PNG with
no explanation:

```html
<div id="err"></div>
<script>window.onerror = (m, s, l, c) => {
  const e = document.getElementById('err');
  e.style.display = 'block'; e.textContent += `${m} @ ${(s||'').split('/').pop()}:${l}:${c}\n`;
};</script>
```

## Running it

```bash
cd tools && npm init -y && npm i puppeteer-core     # once per project
node tools/shoot.mjs 2 12 25 38 47 58               # a sweep of the timeline
node tools/shoot.mjs 30 --tag=wide --q="cam=500,120,-400&look=0,80,0&fov=45"
node tools/shoot.mjs 41 --w=1080 --h=1920           # full-res check before shipping
```

Then **read the PNGs back**. Rendering them and not looking is the most common way to waste an
hour. Each one answers a question you cannot answer from code: is the funnel the right size,
is the camera inside a tree, did the lawn stop tiling.

Headless runs on SwiftShader, Chrome's CPU rasterizer, so a heavy frame takes 5–25 s. That is
fine — you are rendering stills, not video. Keep concurrency at 2; more just thrashes the CPU.

## Expose simulation stats

Define a `simStats()` global and the harness prints it with every frame. Cheap, and it catches
whole categories of bug that are invisible in a picture — a debris pool silently saturated at
capacity, a destruction counter stuck at zero, bodies leaking every frame.

```js
window.simStats = () => ({
  homes: WORLD.destroyed, bodies: BODIES.length,
  frags: Object.fromEntries(Object.entries(POOLS).map(([k, p]) => [k, p.n])),
});
```

A pool pinned at exactly its capacity means you are recycling live particles and the effect is
being quietly clipped. A body count that climbs without bound means nothing is being culled.

## Debug cameras

The director's shots are chosen to look good, which makes them bad for inspection. Use `?cam=`
to answer specific questions:

- **Is anything rendering at all?** Far away, wide FOV, looking at the origin.
- **Is the scale right?** Ground level at 1.7 m beside a building, for a human reference.
- **Does the mechanism work?** Right on top of the thing — the stairwell, the fault line, the
  wave front — ignoring whether it is a pretty angle.
- **Is the geometry sound?** Directly overhead looking down, which exposes gaps, z-fighting,
  and props floating above the terrain.

## A sweep worth repeating

Keep a standard set of timestamps covering every beat and re-render them after any change to a
shared layer — field, lighting, terrain, physics. Shared layers are exactly where a fix for one
shot quietly breaks four others.

```bash
node tools/shoot.mjs 2 8 15 22 30 38 45 52 58
```

When you change something global, compare against the previous set. Because the sim is
deterministic, any difference you did not intend is a regression.

## Diagnosing a silent visual bug

Most bugs in this genre throw nothing. Work them like this rather than guessing at fixes:

1. **Check the harness actually rendered.** If `shoot.mjs` crashed, the PNG on disk is the
   *previous* one, and you will "verify" a fix against a stale frame. Read the log line for
   every frame before reading the image. A `connect ETIMEDOUT` means two harness instances
   ran at once — run one at a time.
2. **Isolate with a flag.** Add query switches that turn one system off (`?noenv` to drop the
   environment map, for example). If the problem disappears, you have found the system.
3. **Same camera, before and after.** Render the same `?cam=` at a time before the effect and
   a time during it. If the dry street is fine and the flooded one is black, the water is the
   suspect, not the lighting.
4. **Output the intermediate value.** Make the suspect shader write one internal quantity as
   its colour for one frame (`gl_FragColor = vec4(body * 4.0, 1.0)`), then restore it from a
   backup. This separates "the value is wrong" from "the value is right but tone mapping or
   blending hides it" in a single render.
5. **Print, then picture.** For anything numeric — water level at a point, survivors, when a
   threshold fires — print it from a node probe (concatenate the sources and run them through
   an indirect `eval` in sloppy mode so declarations become globals) before rendering.

## Shot mode must reproduce accumulated state

Fast-forwarding skips rendering, so anything that normally accumulates **per rendered frame**
— per-texel high-water marks, a camera gait phase, a tracked object's mesh position — is
missing from the still. Sample those during the fast-forward at a reduced rate (every ~6
steps), seed the camera with one update at `t - dt` before the final render, and derive tracked
positions from pure functions of time.

## Patching from the shell

Multi-line patches with apostrophes or template literals break in shell heredocs. Write the
patch as a Python script file, have each replacement report `MISSING` if its anchor text is not
found, and run it with the project root as an argument. Silent no-op replacements are how a fix
"lands" without landing.
