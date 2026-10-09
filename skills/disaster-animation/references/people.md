# Procedural people

People are what turn a destruction demo into a story. A roof peeling off is a physics result;
a kid running for a cellar door while it happens is a video someone watches to the end.

They are also where the uncanny lives. Everything else can be boxes and read fine; a human with
a wrong gait reads as broken. Budget accordingly — a dozen good figures beat a crowd of bad
ones.

## The rig

A plain `THREE.Group` hierarchy. No skinning, no bones, no external model. Each joint is a
group; limbs are capsules parented to joints, so rotating a joint moves everything below it.

```
root (world position + heading)
└ hips (y = 0.95·s)
  ├ torso ──┬ neck ── head ─ (nose, eyes, ears, hair)
  │         ├ shoulderL ── elbowL ── hand
  │         └ shoulderR ── elbowR ── hand
  ├ hipL ── kneeL ── ankleL (foot box)
  └ hipR ── kneeR ── ankleR
```

Scale everything from one height parameter `s = h / 1.75`, so a 1.2 m child and a 1.85 m adult
come from the same code. Give children a slightly larger head ratio (~1.18×) — it is the
cheapest, strongest age cue there is.

Store the pose as a flat dictionary of joint angles and ease toward a target every step. That
way every transition between actions is automatically smooth and you never write blending code:

```js
const JOINTS = ['hipY','torX','torZ','torY','headX','headY',
                'lShX','lShZ','lElX','rShX','rShZ','rElX',
                'lHipX','lHipZ','lKnX','rHipX','rHipZ','rKnX','lAnX','rAnX'];
const k = 1 - Math.exp(-dt * (running ? 18 : 11));
JOINTS.forEach(j => pose[j] += (target[j] - pose[j]) * k);
```

Each action writes `target` from scratch each step. Nothing is stateful, so there is no way to
get stuck in a half-blended pose.

## Gait

Phase advances with **distance travelled**, not time. This is what keeps feet from skating:
the cycle slows when the character slows, and stops when they stop.

```js
const stride = (running ? 2.5 : 1.45) * s;
phase += speed / stride * Math.PI * 2 * dt;
const amp = Math.min(1, speed / (running ? 3.5 : 1.2));
```

The components, all driven off `phase`:

```js
const hipA = (running ? 0.75 : 0.42) * amp;
T.lHipX = -hipA * Math.sin(phase);   T.rHipX =  hipA * Math.sin(phase);
// knees bend only on the swing-through — the raised cosine keeps the stance leg straight
T.lKnX = (0.08 + kn * Math.max(0, Math.cos(phase)) ** 1.5) * amp;
T.rKnX = (0.08 + kn * Math.max(0, -Math.cos(phase)) ** 1.5) * amp;
T.lAnX =  0.25 * Math.sin(phase) * amp;                 // ankles: toe-off and heel-strike
T.lShX =  armA * Math.sin(phase);  T.rShX = -armA * Math.sin(phase);   // arms oppose legs
T.torY =  0.12 * Math.sin(phase) * amp;                 // shoulder counter-rotation
T.hipY = -Math.abs(Math.cos(phase)) * 0.07 * s * amp;   // the body bob
```

Four details separate a believable walk from a puppet: knees bend only on the swing leg; arms
swing opposite the legs; the torso counter-rotates against the hips; and the whole body bobs
down twice per cycle. Running differs mainly by amplitude, a forward torso lean, hard-bent
elbows (~1.45 rad), and a brief airborne phase where `hipY` lifts.

When speed is zero, do not freeze — add a slow breathing oscillation and a weight shift.
A perfectly still human looks dead.

## Action scripts

Each person is a timeline of actions. The scheduler picks the current one by time, resets
per-action state on entry, and the action writes pose targets.

```js
script: [
  { t: 0,    a: 'catch',   x: -19, z: 30.5, heading: 1.6 },
  { t: 7.9,  a: 'look',    at: [-520, 170, 380] },
  { t: 12.6, a: 'wave',    at: [-11, 1.2, 36] },
  { t: 13.4, a: 'run',     path: [[-18.5, 39], [-16, 46.5]], speed: 4.6 },
  { t: 21.2, a: 'descend', path: [[-16, 42.2]], speed: 1.35 },
  { t: 30,   a: 'hide' },
]
```

A useful vocabulary: `idle`, `walk`, `run`, `look`, `point`, `wave`, `shield` (forearm raised
against wind or heat), `film` (phone up), `carry`, `hug`, `crouch`, `fall`, `descend`,
`ascend`, `hide`. Add disaster-specific ones as needed — `brace` against a doorframe for an
earthquake, `wade` for a flood, `cover` for falling debris.

`look`/`point`/`film` all take a world target and derive head pitch and body yaw from it, so
the whole cast can track the same moving object with one line each. Having several people look
at the thing at once is a powerful way to direct the viewer's eye.

## Reacting to the field

Everyone leans into the force and gets buffeted. One block, applied after the action's pose:

```js
sampleField(pos, w);
const wsp = Math.hypot(w.x, w.z);
if (wsp > 6) {
  const local = Math.atan2(w.x, w.z) - heading;
  const lean = clamp((wsp - 6) / 30, 0, 0.35);
  T.torX += -Math.cos(local) * lean;
  T.torZ +=  Math.sin(local) * lean * 0.7;
  const buf = clamp((wsp - 10) / 25, 0, 1) * 0.25;
  T.lShZ += buf * (0.5 + noise1(t * 4.0 + phase));      // arms flail out of phase
  T.rShZ -= buf * (0.5 + noise1(t * 4.3 + phase + 3));
}
```

This one block does enormous work. It is the thing that makes people belong to the storm rather
than stand in front of it.

## Two bugs that will cost you an hour each

**Never drive vertical position from path progress.** If a character descends stairs by
`y = -depth * progress`, they start sinking the instant the action begins — which is out on the
lawn, metres before the opening. Drive height from *actual world position* against the real
geometry:

```js
function stairFloorY(z) {                       // height of the tread under this z
  if (z >= TOP_Z) return 0;
  return -RISE * Math.min(Math.ceil((TOP_Z - z) / RUN), N_STEPS);
}
y += (stairFloorY(pos.z) - y) * Math.min(1, dt * 14);
```

The general rule: **geometry-relative motion must be driven by geometry, not by a normalised
parameter.** The same bug appears as people floating above slopes and wading at a fixed depth
regardless of the actual water height.

**Path followers stop short of the final waypoint.** A follower that advances when
`distance < 0.25` stops about 0.25 m from the last point. Any test like "hidden once past the
doorway" then never fires, and the character stands frozen in the opening forever. Put the
final waypoint *past* the trigger line, and test against a threshold the character will
actually cross.

## Crowds

Beyond about a dozen figures, split the cast:

- **Heroes** (3–8): full rig, scripted, close to camera. These carry the story.
- **Extras** (20–200): the same rig at lower joint-update cadence (every 3rd step), driving
  a shared `InstancedMesh`, with generated rather than authored scripts — flee from the event,
  head for the nearest shelter, mill about before the alarm.

A simple flocking rule covers most extra behaviour: steer away from the event, steer toward the
nearest shelter, separate from neighbours, and scale speed by panic, where panic rises with
proximity and with the number of nearby people already running. Panic spreading through a crowd
is a very strong visual.

Vary height, build, clothing colour and gait phase per extra. Identical phases produce a chorus
line, which is instantly fake.

## Companions

A dog on a leash, a cat, pigeons scattering. Cheap, and they get a disproportionate emotional
response. A quadruped is the same idea as the biped: four leg groups with paired phase offsets,
a tail driven by a fast sine, and a head that bobs when idle and levels out when running.

Keep a leash as a line that sags with slack: `y -= slack * 4u(1−u)` along the segment. A rigid
line between hand and collar looks like a stick.
