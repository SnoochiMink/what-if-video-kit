# Destruction: debris, bodies, and failure thresholds

Two scales of broken thing, with different costs:

- **Fragments** — thousands of small pieces in typed-array pools rendered as `InstancedMesh`.
  Planks, shingles, glass, leaves, rubble, embers, ash.
- **Bodies** — dozens of large pieces that own a real mesh: roof panels, walls, cars, trees,
  signs, a church spire, a water tower. These can break into fragments on impact.

Never give every splinter its own `Mesh`. A thousand meshes is a thousand draw calls and a
dead framerate.

## Drag integration that does not explode

This is the single most important numerical detail in the whole engine. Aerodynamic drag is
`F = ½·ρ·Cd·A·|u|·u` with `u = wind − velocity`. Integrate that explicitly and a leaf — tiny
mass, large area — overshoots the wind speed, reverses, overshoots harder, and the simulation
blows up within a few frames at `dt = 1/60`.

The fix is to treat drag as exponential relaxation toward the surrounding flow, which is
unconditionally stable for any mass, area or timestep:

```js
const k0 = 0.5 * RHO * cd * A / m;              // per-object constant
// per step:
let ux = wind.x - v.x, uy = wind.y - v.y, uz = wind.z - v.z;
const sp = Math.sqrt(ux*ux + uy*uy + uz*uz);
const k = k0 * sp;                               // 1/s relaxation rate
const f = 1 - Math.exp(-k * dt);                 // always in [0,1) — cannot overshoot
v.x += ux * f;  v.y += uy * f - G * dt;  v.z += uz * f;
```

`f` can never exceed 1, so the object asymptotically approaches the wind speed and never passes
it. Heavy objects get a small `f` and barely respond; a leaf gets `f ≈ 1` and matches the flow
almost instantly. That mass-dependent spread is exactly the sorting you see in real footage —
light debris goes first and highest.

Give flat plates — roof panels, sheet metal, doors — a lift term too. It is why they fly rather
than tumble:

```js
if (cl) v.y += cl * k0 * (ux*ux + uz*uz) * dt;
```

## Fragment pools

One pool per material, each a struct-of-arrays over typed arrays plus one `InstancedMesh`.

```js
class FragPool {
  constructor(geo, mat, cap, props) {
    Object.assign(this, props);                  // m, A, cd, cl, mu, spin, half-extents
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.n = 0;
    this.p = new Float32Array(cap * 3);  this.v = new Float32Array(cap * 3);
    this.q = new Float32Array(cap * 4);  this.w = new Float32Array(cap * 3);
    this.sleep = new Uint8Array(cap);
  }
}
```

Three behaviours make pools feel alive rather than like a particle system:

**Sleep.** A piece at rest with wind too weak to overcome friction stops integrating entirely.
Wake it when `k0·|wind|² > μ·g`. Without this, the ground slowly fills with jittering debris
and the framerate dies in the last third of the video — exactly when the most is on screen.

**Recycle, don't grow.** When the pool is full, prefer a sleeping slot; fall back to a random
one. Checking a handful of random slots for a sleeper is O(1) and good enough.

**Tumble with the flow.** Drive angular velocity from relative wind speed rather than giving
each piece a fixed spin. Debris that tumbles faster in stronger flow reads as physical.

```js
const wl = Math.hypot(w[i3], w[i3+1], w[i3+2]) + 1e-6, tgt = this.spin * sp;
const s = 1 + (tgt / wl - 1) * Math.min(1, dt * 3);
w[i3] *= s; w[i3+1] *= s; w[i3+2] *= s;
integrateQuat(q, i*4, w[i3], w[i3+1], w[i3+2], dt);
```

Ground contact needs the rotated half-height, or boxes sink corner-first into the terrain:

```js
halfY(q, o) {                                    // vertical extent of a rotated box
  const x=q[o], y=q[o+1], z=q[o+2], w=q[o+3];
  return Math.abs(2*(x*y + w*z))*this.hx + Math.abs(1-2*(x*x+z*z))*this.hy + Math.abs(2*(y*z - w*x))*this.hz;
}
```

## Breakable bodies

A body owns a mesh, integrates like a fragment but with its own inertia, and carries a
`breakAt` time and a `breakSpeed` impact threshold. When either trips, it hides itself and
sprays fragments — a roof panel becomes planks, shingles and sheet metal.

```js
addBody(roofMesh, {
  m: 700, A: 30, A0: 30, cd: 1.0, cl: 0.35, mu: 0.7, spin: 0.035,
  breakAt: 1.2 + rand() * 2.2,          // it comes apart in flight
  breakSpeed: 9,                        // or on a hard enough landing
  onBreak: b => {
    spray('plank',   22, b.obj.position, ...);
    spray('shingle', 70, b.obj.position, ...);
    DUST.burst(b.obj.position, 6, 5);
  },
});
```

`A0` is the drag area while grounded, usually much smaller than `A` in free flight — a wall
lying flat catches far less wind than one standing up. Without it, flat debris skates across
the ground like a hovercraft.

## Threshold-driven failure

Do not keyframe destruction. Give each object real thresholds and let the field decide when it
fails. Then the on-screen counter reports something true, the damage follows the path of the
event, and you get organic variation for free.

```js
const j = () => 0.9 + rand() * 0.22;            // ±10% per object, so a street fails raggedly
h.t = { cladding: 28*j(), glass: 40*j(), roof: 50*j(), walls: 64*j(), swept: 86*j() };
```

Jitter is what stops a block of houses failing in unison like a Mexican wave.

**Order matters more than thresholds.** Real structures fail in a sequence, and getting the
sequence right is most of the realism:

1. Surface skin peels (shingles, cladding, tiles) — progressive, a few pieces per frame
2. Glazing fails — windows blow *inward* at first, then out as internal pressure equalises
3. The roof deck lifts — windward side first
4. Walls fail, but only once the roof diaphragm is gone, because the roof was bracing them
5. The structure is swept to the slab, leaving the foundation

Enforce that with gating, not just thresholds:

```js
const roofGone = h.roofs.every(r => r.parent !== h.g);
if (roofGone) { /* only now consider the walls */ }
```

For real-world thresholds — wind by EF rating, peak ground acceleration by building type, flow
depth for buildings washing out — see the relevant `disasters/*.md`.

## Rubble

When a structure is destroyed but not yet removed, swap it for a merged rubble pile: 60–80
random boxes, vertex-coloured from the building's own palette plus insulation pink and
timber tan, merged into a single geometry. One draw call, reads correctly, and it is what the
camera lingers on in the aftermath shots.

Give the pile a slight dome — pieces near the centre sit higher — because a flat scatter reads
as debris on a floor rather than a collapsed building.

## Dust

Dust is what makes destruction land. Every impact, collapse and ground scour should emit it.
Soft, large, slow sprites with an animated size, tinted to the material: brown for soil, grey
for concrete, pale for plaster, black for smoke.

Drive dust velocity from the field but only every few steps — it is the cheapest possible place
to save CPU and nobody can tell.

```js
DUST.burst(x, y, z, count, radius, [0.42, 0.36, 0.29]);
```

The rule of thumb: if something heavy hits the ground and no dust comes up, it reads as
weightless no matter how good the physics was.
