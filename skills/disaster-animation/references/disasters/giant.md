# Giant (kaiju, colossus, a 250 ft person walking down your street)

Built for "What if an AI influencer escaped?" (`E:\what if tiktok\giant influencer`): Rupert at
236 ft dancing and singing down a Midtown avenue toward a POV on the sidewalk. Everything below
generalises to any giant body: a monster, a robot, a statue come to life.

## Field

**The body IS the field.** There is no separate damage function. ~20 capsules ride the
character's joints (torso, shoulders, upper arms, forearms, hands, head, thighs, shins, feet),
recomputed every fixed step from the joints' `matrixWorld`, with per-capsule velocity from the
previous step. Every facade chunk, car, lamp post and person tests against those capsules, and
rubble leaves along the velocity of the limb that hit it. That is the one-field rule applied to a
character: the visible arm and the destruction are the same object, so they cannot drift apart.

```js
const BODY = [  // [jointA, offsetA, jointB, offsetB, radius] in rig units
  ['shoulderL', [0, -0.06, 0], 'elbowL', [0, 0, 0], 0.115],
  ['ankleL', [0, -0.04, -0.04], 'ankleL', [0, -0.04, 0.17], 0.065],   // the sole
  ...
];
c.va.subVectors(newA, c.a).multiplyScalar(60);   // velocity for the debris it throws
```

Anchor numbers, all computed from the rig so captions are arithmetic, not guesses:
- **Scale.** Pick the height, derive everything else. The square-cube law: k times taller is
  k^3 heavier on k^2 the bone cross-section. At 37x: 52,000x the weight, 1,400x the area.
- **Speed: Froude scaling.** A walk sits at Froude number ~0.25 (v^2 / gL). A 72 m man walks
  at ~8-9 m/s, a step every ~1.2 s. Faster reads as a costume running past a model; the giant
  must move SLOWLY in absolute terms to read as big.
- **Width vs the street.** Manhattan avenues are 100 ft (30.5 m) building line to building line,
  streets 60 ft (Commissioners' Plan, 1811). Size the giant so the shoulders are a little wider
  than the street: he brushes the tall buildings, and only his dancing hits the rest.

**Size it so contact is occasional, not constant.** At 250 ft Rupert's resting hands sat 2 m
inside both facades and the walk levelled the whole avenue at the 10th floor: 112 chunks gone in
the first second, every frame full of rubble. At 236 ft the shoulders brush, the hands are
free, and the dance moves decide what breaks. Count dead chunks per second in `simStats()`
before you look at a single frame.

## Motion

- **Plan footsteps up front from the choreography**, landing on beats. Each step:
  `{ foot, t, dur, x0, z0, x, z, yaw, lift, kind }`. A planted sole does not move until it lifts;
  at this scale a foot that skates one metre reads instantly as a toy.
- **Make the start distance an OUTPUT.** Build the plan in a local frame from z = 0, then shift
  every step so the LAST step lands exactly where you need it (on the camera). The HUD distance
  is then real and the ending is guaranteed to connect.
- **Legs by analytic two-bone IK** in world space: hip joint to ankle target, knee bent toward
  the foot's forward vector, thigh basis from (knee-to-hip, knee forward), knee as one X rotation,
  ankle quaternion = shin_world^-1 * foot_world. Clamp pelvis height so both planted feet are
  reachable (0.985 of leg length), or a planted foot lifts off the ground.
- **Pelvis over the feet**, shifted toward the stance foot by `0.32 * sin(pi * swingU)`, dipping
  a little mid-swing. Arm swing from where the feet actually are (`(zL - zR) / stepLen`), not
  from a clock, so it stays right through stomps and spins.
- **Upper body: a pose library**, one function per move `(beat, beatInMove, gait) -> rotations`,
  crossfaded over the first beat of each move. Aim the head and a pointing arm at the camera by
  converting the target into the parent joint's frame (Euler 'YXZ':
  `x = -acos(-d.y), y = atan2(d.x, d.z)` points the arm's -Y along d).
- **Arms raised "up" must go UP.** Sideways-up (shoulder z ~2.1) puts the hands 30 m out, inside
  the buildings, and the arm vanishes. Use ~2.6 for overhead moves in a canyon.

## Visual signature

Scale cues do all the work: the giant against floor lines and windows, against yellow cabs, and
against people. Keep the people and cars in frame with him. Destruction in the shape of his
body: a shoulder-height groove where he brushed, a hand-shaped bite where he swept, crushed cars
in footprint-sized patches, and shoe-shaped craters with radial cracks in the asphalt (a uniform
array of footprints in the ground shader).

Details that sold it: a crushed taxi stuck to his sole, picked up in an early stomp and revealed
in the last shot; LED screens on the facades running breaking news and his own livestream, which
break exactly where the wall behind them breaks because they are drawn by the chunk shader.

## Destruction order

| Contact | Effect |
|---|---|
| capsule overlaps a facade chunk (one floor x 4 m x 3.4 m) | chunk removed; 6-9 rubble lumps along the limb velocity (capped at ~22 m/s across, 7 m/s up), 3 glass panes, a dust cloud |
| chunk removed | neighbours (+-1 row/col) gain damage: windows go dark, cracks, soot |
| sole coming down on a car (foot vy < -2.5 or slow) | crushed flat in place (vertex shader folds the cabin) |
| foot swinging through a car (horizontal speed > 4 m/s) | kicked: rigid body, tumbles, bounces, rests |
| leg or foot through a lamp post or signal | pole falls about its base, theta'' = (3g/2h) sin theta, one bounce |
| footstep landing | dust ring, cars within 34 m hop on their springs and put hazards on, people within ~34 m knocked flat, footprint added |

**Facade chunks.** One InstancedMesh for ~18k chunks, three layers deep behind every
avenue-facing facade up to the reach height, a core box behind them and an upper box above.
The facade pattern is computed from WORLD position against per-building parameters so all
chunks of a building line up. Per-face exterior bitmask: street face, the corner faces, roof,
and PARTY WALLS (the side faces that meet the neighbouring building: blank masonry, exposed
wherever the neighbour is shorter). Any face not flagged renders as a cutaway floor: slab
edge, dark room, ceiling, drywall scraps. Without the party-wall bit, every tower's flank above
a shorter neighbour rendered as cutaway and covered the skyline in white blotches.

## Camera beats

POV on the sidewalk, one continuous take, no cuts:
1. 0-4 s: the hook title over him singing at the far end of the canyon (title high, NOT over him).
2. Standing frozen, staring up; most of the crowd filming. FOV narrows with distance (39 deg at
   1,300 ft) so he is a quarter of the frame from the first second.
3. Two slow glances away (the jam, the gawkers finally running), back to him.
4. He fills more frame; FOV widens toward 80 deg as he closes.
5. Backing away: unsteady steps backward.
6. The trip: down onto the pavement in under a second, tumble roll, impact bounce.
7. Lying on the ground looking up at him; then at the sole as the leg lifts.
8. The sole fills the sky, the light goes, black, end card.

**Clear the sightline.** Nothing may stand in the corridor between the POV and the giant: no
street tree, lamp post, hot dog cart umbrella or gawker. Each of those hid him completely in an
early render, because in a 9:16 frame looking down a street the giant occupies a thin central
strip. Move props against the buildings and put gawkers BESIDE or behind the camera.

At the end, light the underside of the shoe with a raised hemisphere ground colour (street
bounce). Unlit, the sole is a black hole.

## Audio

If the giant sings, the vocal and the choreography must share one score (see the `sung-vocals`
skill). Footsteps are the bed of everything else: low thud delayed by distance / 343, cars'
alarms after each step, glass after each chunk.

## Verified facts

- Manhattan avenues are 100 ft wide and streets 60 ft, set by the Commissioners' Plan of 1811.
- Square-cube law: scaling a body by k multiplies mass by k^3 and bone cross-section by k^2, so
  stress rises by k. Galileo, *Two New Sciences*, 1638.
- A walking gait sits near Froude number 0.25; walk-run transition near 0.5 (Alexander, 1989).
