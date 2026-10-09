# The prompt pack

Copy-paste prompts for Claude Code, in the order you use them. Replace anything in
`<angle brackets>`.

The skill does the heavy lifting — these prompts exist to set scope, force verification, and
stop the three things that waste the most time (building before you can see, polishing before
the field works, and exporting before you've reviewed).

---

## 0 — Pick the idea

> I want to make a 60-second vertical "what if" disaster video. Give me 10 title ideas in the
> form "What if X happened to your town?" that are visually dramatic, physically simulatable
> with three.js low-poly geometry, and have a real, checkable fact I can put on the end card.
> For each, tell me the one image the whole video is selling.

---

## 1 — Kick off the build

> Build a ~60 second 9:16 disaster animation: **<WHAT IF AN EF5 TORNADO HIT YOUR TOWN?>**
>
> Use the disaster-animation skill. Before anything else, stand up the headless preview
> harness and render one frame so we can both see what we're doing. Then build in the skill's
> order: field, world, physics, destruction, people, sky/lighting, direction.
>
> Render two or three frames after every meaningful change and read them back to me. Don't
> stack two unverified stages.

**Why it's worded that way.** "Render a frame first" is the single highest-leverage instruction
in the whole workflow. Without it Claude writes a thousand lines of beautiful simulation code
that renders a black rectangle, and neither of you finds out for an hour.

---

## 2 — Real event instead of a hypothetical

> Make this the **<2011 Tōhoku tsunami in Miyako, Iwate>**, not a generic one. Reconstruct the
> real timeline minute by minute from sourced figures. Every number on screen — the clock, the
> wave height, the warning level — must come from the actual record, and I want the source
> named in the caption or end card. Do not invent a single statistic.
>
> Use a POV camera at eye level, as if someone on the street filmed it.

---

## 3 — The hook / title card

> Write the opening title card. Three lines in the HUD: a small letterspaced sans eyebrow, then
> a big serif line, then the payoff line in the accent colour. It should be legible in half a
> second on a muted phone.
>
> Cold-open on the payoff: 0–2.2s is the climax with the title over it, then hard-cut to calm
> with a time stamp. The title fades out by 3.6s. Compute its opacity from film time, never
> with a CSS transition.

---

## 4 — The top-left counter

> Put a live counter in the top left of the HUD, inset `left: 6%`, with the band starting at
> `top: 13%` so TikTok's UI doesn't cover it.
>
> Structure: a sans eyebrow label in caps with 0.22em letter-spacing, a big serif number under
> it, and a small grey sub-line. Use Cambria or Times with `font-variant-numeric: lining-nums
> tabular-nums`, `line-height: 1` — Georgia's old-style figures make 3 4 5 7 9 sink into the
> line below.
>
> The number must be a **real value read out of the simulation**, not a keyframed animation.
> Make it `<DISTANCE TO YOU, counting down, turning red inside 500 ft>`.
>
> Put the secondary counters in a right-hand column in the same flex row so the two can never
> overlap whatever the digits do.

---

## 5 — Captions

> Add captions: short, present tense, one idea each, a new one roughly every 3 seconds with one
> on screen almost continuously. Italic serif, cream, centred, with one or two words per line
> highlighted in the accent colour.
>
> Animate per word with a stagger, and compute every word's opacity and transform **from film
> time every frame**. No CSS `animation` or `transition` anywhere in the HUD — those run on the
> wall clock and come out half-faded in exported frames.

---

## 6 — Make it stop looking cheap

> This reads as a cheap animation. Fix the usual causes, in this order:
>
> 1. The world ends — build the city out to the horizon on one grid so no street runs into a void.
> 2. Nothing moves — add traffic and pedestrians the disaster can switch off.
> 3. The image is flat — linear HDR render, tone mapped once in post, graded, physically based
>    sky with the sun where it actually was, and IBL baked from that sky.
> 4. Captions are too sparse — get to one roughly every 3 seconds.
> 5. The HUD is all one sans face — serif headline, italic serif caption, letterspaced sans support.
>
> Render a frame after each one.

---

## 7 — Camera

> Re-cut the camera. Cut every 1.5–3 seconds and alternate scale: wide, close, ground level,
> overhead. Always keep something of known size in frame for scale.
>
> Remember 9:16 at a 45° vertical FOV is only about 25° wide — put the subject ON the camera
> axis, not near it, and clear the corridor between the eye and the subject of street trees,
> lamp posts and extras.
>
> Add handheld: smooth noise, low frequency drift plus high frequency shake scaled by the
> actual field strength. Never per-frame random.

---

## 8 — Review before exporting

> Export the range `--from=<X> --to=<Y>` and open it. I want to watch it in a browser before we
> commit 20 minutes of GPU time to the full render.

Then, after you've watched it:

> Notes from watching it: <...>. Fix those, re-export the same range, and show me again.

---

## 9 — The end card

> Write the end card. Hold it 4–6 seconds. One real, checkable fact with the place and date
> named so the source is implied, then a question that invites a comment. Keep the fact
> genuinely true — one invented statistic in the comments costs the account its credibility.

---

## 10 — Final export

> Full export: `node tools/export.mjs` at 1080×1920, 60 fps. 60 fps because the sim steps at
> 1/60s, so each output frame is exactly one simulation step with no resampling.
>
> Then give me the file path and the duration.

---

## Debugging prompts that actually work

| Symptom | What to say |
|---|---|
| Black frame, no error | *"The frame is black with no exception. Put a debug camera far outside the scene and render that, and check for shader compile errors in the console — they're console errors, not page errors."* |
| A fix changed nothing | *"That changed nothing. Confirm the harness actually re-ran and the patch anchor matched — don't read a stale PNG."* |
| Debris orbiting empty air | *"The debris isn't tracking the visual effect. The GPU and CPU copies of the field expression have drifted — show me both side by side."* |
| People sinking through ground | *"Characters are sinking. Their motion is probably driven by path progress instead of actual position — drive it from position and clamp to the terrain height."* |
| Looks fine but boring | *"Technically fine, dramatically dead. The cut is too slow and the captions are too sparse. Re-cut to 1.5–3s and get captions to one every 3s."* |
| Night scene unreadable | *"Too dark to see. Show the failure in daylight instead — signals dark, steam stopped, traffic stopped — and keep the light constant."* |

---

## One standing instruction worth adding to your project's CLAUDE.md

```
Never judge a frame from the single-shot harness alone — it renders large areas black at
preview size while the export of the same moment is correct. Verify through
`node tools/export.mjs --from=X --to=X+1` before telling me something looks right.

Never fade a HUD element with a CSS transition or animation. Every HUD property is a pure
function of film time, computed every frame.
```
