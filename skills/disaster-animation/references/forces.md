# The force field

Every disaster in this engine is one object: a **state that evolves over time** plus a
**function that samples a force at a point**. Write that first, before any geometry. Once it
exists, debris, buildings, trees, people, dust, camera shake and audio all become consumers of
the same source, and they automatically agree with each other.

```js
const FIELD = { t: 0, /* disaster-specific state */ };
function updateField(t) { /* advance state from keyframe tracks */ }
function sampleField(p, out) { /* -> force, velocity, or displacement at world point p */ }
```

Keep `sampleField` cheap. It is called tens of thousands of times per step. No allocation, no
`Math.pow` where a multiply will do, and write into a passed-in vector rather than returning a
new one.

## Driving state with keyframe tracks

Hand-authoring the arc of a disaster beats simulating it. You want the climax at a specific
second because the edit demands it, not whenever the physics happens to peak. Keyframe the
*parameters* and let the physics be real underneath.

```js
const K = {
  intensity: [[0, 0], [11, 26], [24, 70], [33, 93], [43, 104], [48, 95], [61, 66]],
  radius:    [[0, 7], [14, 13], [25, 39], [45, 46], [61, 42]],
};
// Catmull-Rom through the keys: smooth velocity, no corners.
function track(keys, t) { /* see core.js */ }
// Piecewise-linear where overshoot would be wrong (counters, 0..1 gates).
function trackLin(keys, t) { /* ... */ }
```

Use the smooth form for physical quantities, where a sudden change in rate reads as a glitch.
Use the linear form for anything that must not overshoot — a door opening 0→1, an on-screen
counter, an alpha gate. A Catmull-Rom spline through `[[0,0],[1,1]]` can exceed 1, which turns
into a door that opens past its hinge.

## Sharing one expression between GPU and CPU

The visual effect usually lives in a shader and the physics lives in JavaScript. When they
disagree, debris orbits empty air. Define the shared part once in each language, keep the two
copies adjacent, and comment them as a matched pair.

```glsl
// --- must match axisAt() in field.js ---
vec2 axisAt(float y){
  float h = clamp(y/uH, 0.0, 1.2);
  vec2 w = vec2(sin(y*0.011 + uTime*0.55), cos(y*0.009 + uTime*0.47));
  return uBase.xz + uLean*pow(h,1.5) + w*uWob*h*(1.0-0.55*h);
}
```

```js
// --- must match axisAt() in the GLSL shared block ---
function axisAt(y, out) {
  const h = clamp(y / FIELD.H, 0, 1.2), t = FIELD.t;
  const wx = Math.sin(y * 0.011 + t * 0.55), wz = Math.cos(y * 0.009 + t * 0.47);
  const hp = Math.pow(h, 1.5), wa = FIELD.wob * h * (1 - 0.55 * h);
  return out.set(FIELD.pos.x + FIELD.lean.x * hp + wx * wa,
                 FIELD.pos.z + FIELD.lean.y * hp + wz * wa);
}
```

Keep this shared piece short — an axis, a wave height, a blast centre. If you find yourself
duplicating fifty lines, move the work to the CPU and feed the shader a small uniform instead.

## Field archetypes

Most disasters are one of these, or a sum of two.

### Vortex (tornado, hurricane eyewall, dust devil, whirlpool)

Tangential velocity peaking at a core radius, plus inward flow near the ground and an updraft
in the core. The Rankine-style profile below is solid-body inside the core and decays outside:

```js
const q = r / rCore;
const vt = Vmax * 2 * q / (1 + Math.pow(q, 2.6));   // peaks at r = rCore
const bl = Math.exp(-p.y / 45);                     // boundary layer near the ground
const vr = -0.42 * vt * bl * smooth(0.35, 1.0, q);  // inflow: what drags debris in
const vu = Vmax * 0.55 * Math.exp(-q * q * 0.6);    // updraft: what lofts it
```

The inflow and updraft are what sell it. Tangential velocity alone makes debris circle at a
fixed radius forever, which looks like a carousel.

### Blast wave (asteroid impact, explosion, supernova shock)

A spherical shell expanding from a centre, with overpressure falling off and a negative phase
behind it that pulls debris back toward the origin.

```js
const d = p.distanceTo(centre);
const front = FIELD.blastR;                         // grows fast, then decelerates
const w = (d - front) / FIELD.thickness;
const over = Math.exp(-w * w) * FIELD.peak / (1 + d * d / 4e4);
const sign = w > 0 ? 1 : -0.35;                     // suction behind the front
out.copy(p).sub(centre).normalize().multiplyScalar(over * sign);
```

The light arrives before the shock. Model that gap — a thermal/flash phase, then seconds of
silence, then the wave — and the scene reads as a real impact rather than a cartoon boom.

### Ground displacement (earthquake, landslide, building collapse)

Not a force on objects but a moving *reference frame*. Everything resting on the ground gets
the ground's acceleration applied; everything in the air does not.

```js
function groundDisp(p, t, out) {               // metres, world space
  const d = p.distanceTo(EPI) ;
  const arrival = d / FIELD.vS;                // S-waves ~3.5 km/s
  const u = t - arrival; if (u < 0) return out.set(0, 0, 0);
  const env = Math.exp(-u / FIELD.decay) * (1 - Math.exp(-u / 0.6));
  return out.set(Math.sin(u * 7.1) * 0.9, Math.sin(u * 4.3) * 0.35, Math.cos(u * 6.2) * 0.8)
            .multiplyScalar(env * FIELD.amp / (1 + d / 8000));
}
```

Objects topple because of the *acceleration* of this displacement, not its position. Take the
second derivative, apply it as a pseudo-force in the object's frame, and tall thin things fall
first — which is exactly what real footage shows.

### Advancing front (tsunami, flood, lava, wildfire, pyroclastic flow)

A height or boundary that sweeps across the terrain. The force is drag from the moving medium,
plus buoyancy once submerged.

```js
const h = waterHeightAt(p.x, p.z, t);               // the one source of truth
if (p.y < h) {
  const sub = clamp((h - p.y) / objHeight, 0, 1);
  out.copy(flowVelocityAt(p.x, p.z, t)).sub(obj.v)
     .multiplyScalar(0.5 * RHO_W * obj.cd * obj.A * sub);
  out.y += RHO_W * obj.vol * sub * G / obj.m;       // buoyancy — this is why cars float
}
```

Buoyancy is the detail that makes flood footage recognisable. Cars lift and drift rather than
sliding; houses float off foundations intact before breaking up.

### Radial attraction (black hole, gravitational collapse)

Inverse-square pull plus a tidal differential across the object. Tidal stretching, not the pull
itself, is the visual signature.

```js
const d = Math.max(p.distanceTo(SING), 1);
const g = FIELD.GM / (d * d);
const tidal = 2 * FIELD.GM * objLength / (d * d * d);   // stretch along the radial axis
```

## Sampling cadence

Not everything needs the field every step at full precision. Spending the budget where it
shows:

| Consumer | Cadence |
|---|---|
| Rigid bodies, large debris | every step |
| Small debris pools | every step, but sleep anything at rest |
| Dust, grass, foliage | every 4–8 steps, interpolated between |
| People | every step for the leaning, cheaper for the wind buffet |
| Camera shake | every rendered frame, at the camera only |
| Audio | every rendered frame, at the camera only |

## Keep the field honest

Two sanity checks worth running before building anything on top:

**Print it.** Sample along a line through the event and log the magnitudes. If your tornado
reads 300 m/s at 500 m out, the keyframes are wrong and no amount of shader work will fix the
debris behaviour.

**Match reality at one anchor point.** Pick a single documented number for the disaster — peak
wind, wave height, peak ground acceleration, overpressure at a known radius — and tune the
field so it hits that value. Everything else can be artistic. That one anchor is what keeps
the end-card fact and the on-screen counters honest, which is the whole credibility of the
format.
