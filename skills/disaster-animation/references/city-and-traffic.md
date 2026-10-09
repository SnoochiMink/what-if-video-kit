# A city that reaches the horizon, and traffic that lives in it

Read this when a shot looks down a street, over a skyline, or anywhere the world could
run out before the frame does. Worked example: `E:\what if tiktok\baby\js\metro.js` and
`js\traffic.js` (the "last baby" piece).

## Why it matters more than any single model

The user's verdict on a street that ended 240 m away in a green field, with a box
"skyline" floating over a white void, was "it looks like a cheap animation". The hand-built
block was fine. **The world ending was the cheap thing.** A 9:16 frame looking down a
street spends its whole upper half on the far distance, so the far distance is half the
picture. Second was **nothing moving**: a street with parked cars and no traffic reads as
a photograph of a model.

## The city: one grid, read by everything

- Pick constants once: N-S street pitch `SX`, cross-street origin `Z0` and pitch `SZ`,
  street half-width. The hero street is one line of that grid (x = 0).
- The **ground shader draws the grid from the same constants** (distance to the nearest
  street gives asphalt / pavement / lot, centre dashes, zebras near junctions), and
  **buildings are placed in the blocks between**, so they can never disagree. Cut a hole
  over the hand-built hero block with `discard` in the shader, not a hole in geometry.
- Blocks are split into lots recursively (BSP; min size grows with downtown height), then
  one box per lot, or podium + shaft + crown + mast for towers. ~5,000 buildings is ONE
  `InstancedMesh` of a unit box with per-instance attributes (wall colour; floor height,
  bay width, glazing ratio, seed; base y, kind, ruin threshold, top y).
- **Downtown is a sum of Gaussian clusters**, not a ramp. Put the main cluster slightly off
  the street axis, behind the vanishing point, so it fills the top half of the frame.
- Lots fronting the hero street are capped mid-rise and flush to the building line. That
  continuous street wall is what makes the corridor read as a street to the horizon.
- Ground plane: non-uniform rows (6 m near, 200 m far), out to ~9 km. **Check winding**
  (normal.y > 0) or it is culled with no error.
- Albedo: real facades are LOW (concrete ~0.35, brick ~0.25). At 0.6 the whole city went
  paper-white under the sun. Multiply palettes down rather than fighting the grade.
- Lighting: a sun directly behind the camera flattens everything. Cross-light (in the
  baby piece alt 28, az 205: one side of the street in shade, shadows across the road) is
  what gives the corridor depth. Try four angles with `?sun=alt,az` in one minute.

## Facades: procedural, with real rooms behind the glass

All in the fragment shader from world position, no textures:
- `cell = (u / bayW, (y - base) / floorH)`, a window rect inside each cell. Kinds: masonry,
  curtain wall (mullions + spandrels), blank (plant rooms, masts), open frame (construction).
- Ground-floor shopfronts with a sign band, and **roller shutters** driven by a uniform
  (closed fraction ~ 1 - occupancy): the high street shuts one shop at a time.
- **Interior mapping** (van Dongen 2008; used for the windows in Spider-Man and Cyberpunk
  2077): intersect the view ray with the room's back wall, side walls, floor and ceiling
  inside each window cell. Real parallax for zero geometry. `GLSL_ROOM` in the baby
  project's `core.js` is a drop-in: `roomColor(f, W, H, V, N, T, hash, lit)` returns linear
  radiance; add it as emission, and make the glass itself dark and smooth (roughness ~0.05)
  so the PBR environment supplies the reflection. The same function upgrades hand-built
  hero facades: compute the cell from world position on the street face only.
- **Filter the pattern at distance**: `far = smoothstep(0.22, 0.75, max(fwidth(cell)))`,
  then mix toward the pattern's average colour and roughness, or 5,000 window grids alias
  into moire. Keep far roughness ~0.6: grazing smooth facades reflect the whole sky and
  turn white.
- `sign` is a GLSL built-in. Never name a variable that; the compile error shows up only
  as a missing city.

## Making the city respond (all from the field, no keyframes)

| Signal | Driver | Where it reads |
|---|---|---|
| lit rooms (daytime: ~20 % at most) | occupancy x grid | every window, near and far |
| shop shutters down | 1 - occupancy | far ground floors |
| broken panes (dark, no reflection) | decay stage `glass` | facades |
| streaks, ivy from the street up, green roofs | decay / veg | facades, roofs |
| towers lose their tops, one at a time | per-building threshold vs ruin curve | skyline |
| cranes slew, freeze, one left standing falls at ~yr 100 | time; work stops early | skyline |
| unfinished frames rise a little, then never again | first years only | skyline |
| power-station steam (vertex-shader particles) | grid | horizon |
| billboard re-papered as the market changes | year bands | one rooftop ad |
| wild trees seed into the streets, street trees outgrow | veg, per-tree arrival year | everywhere |

Attached pieces (crowns, masts, plant rooms) must fall WITH their tower. Flag them (the
baby piece adds +10 to the threshold) and move them away when the parent fails, or they
float in the sky where the roof used to be.

**Show grid failure in daylight.** A blackout-as-night shot was rejected as "too dark to
see". Signals going to flashing amber then dark, the steam stopping and the traffic
stopping say the same thing and keep the frame readable. A constant light also keeps a
locked-off 110-year frame a fair comparison.

## Traffic: the Intelligent Driver Model

`dv/dt = a [1 - (v/v0)^4 - (s*/s)^2]`, `s* = s0 + vT + v dv / (2 sqrt(ab))`
(Treiber, Hennecke & Helbing 2000). Urban values: v0 ~13.5 m/s, T 1.3 s, s0 2.4 m,
a 1.3, b 2.1. This one law gives platoons, queues that discharge one car at a time, and
brake-light ripples. Everything else is a **stationary virtual leader** on the lane:
- red light: leader at the stop line; amber: only if `ds > v^2 / 2b`;
- the bus stop: leader until the dwell timer runs out;
- a parking slot: leader at the slot, with a lateral swing into the kerb over the last
  ~20 m. Once the swing passes 1 m the car stops being anyone's leader.

Lanes: a lane coordinate `s` plus axis, direction and offset; keep each lane's cars
sorted and iterate front to back. Signals: one cycle with main and cross phases, offset
per junction (green wave); `normal`, then `flash`, then `off`, from the grid. Lamps are one
InstancedMesh of emissive discs with linear colours > 1 so they bloom.

**Time-compression trap.** A car takes ~2 minutes of film to cross 1.8 km while decades
pass every second. Volume has to change at junctions: cars **turn off** at a junction when
the lane holds more than the target and **turn in** at junctions when it holds fewer.
Without that, the year-65 street still had 360 cars driving.

**Cars do not vanish when people do.** As traffic falls, moving cars are picked (only
where the camera can see, only into a free slot just ahead) to pull in and park for good.
Their rust and flat tyres count from *the year they were left*. The kerb visibly fills
with the cars of people who died, which is a far stronger image than cars fading out.

Bodies: extrude a **side profile** (bonnet, raked screen, roof, boot) across the width with
a small bevel, and extrude the greenhouse 3 cm wider than the body so it shows on both
flanks as side glass. Paint metalness at most ~0.2 and roughness ~0.4; at 0.5 metalness
every pale car glared white. Use a weighted real-world paint palette (white, black, grey
and silver dominate).

## Budget seen in practice

193 draw calls, ~4.5 M triangles counted across the shadow and main passes (8.7 M before
the tree canopies dropped to icosahedron detail 0; at that distance nobody can tell).
