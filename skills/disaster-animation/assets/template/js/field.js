'use strict';
// =====================================================================
// THE FORCE FIELD — replace this with your disaster.
//
// Everything else in the project reads this file: debris, buildings,
// people, dust, camera shake and audio. Get it right first, and the rest
// of the scene agrees with itself automatically.
//
// See references/forces.md for the archetypes (vortex, blast wave, ground
// displacement, advancing front, radial attraction) and
// references/disasters/<name>.md for the specific recipe.
// =====================================================================

const FIELD = {
  t: 0,
  pos: new THREE.Vector3(),      // where the event currently is
  vel: new THREE.Vector3(),      // how fast it is travelling
  dir: new THREE.Vector2(0.8, -0.6).normalize(),
  intensity: 0,                  // the headline number the HUD reports
  radius: 10,
  dark: 0,                       // 0..1 how much the sky has turned
  reach: 0,                      // 0..1 how fully the event has arrived
};

// Keyframe the arc, then let real physics run underneath it. You want the
// climax at a chosen second because the edit demands it, not whenever the
// simulation happens to peak.
const K = {
  s:         [[0, -1500], [16, -720], [28, -200], [50, 152], [61, 300]],   // metres along the path
  intensity: [[0, 0], [11, 26], [24, 70], [33, 93], [43, 104], [48, 95], [61, 66]],
  radius:    [[0, 7], [14, 13], [25, 39], [45, 46], [61, 42]],
  reach:     [[0, 0], [8, 0.12], [12.8, 1]],
  dark:      [[0, 0.3], [12, 0.78], [28, 1], [61, 0.75]],
};

function updateField(t) {
  FIELD.t = t;
  const s = track(K.s, t);
  FIELD.pos.set(FIELD.dir.x * s, 0, FIELD.dir.y * s);
  const s2 = track(K.s, t + 0.05);
  FIELD.vel.set(FIELD.dir.x * s2, 0, FIELD.dir.y * s2).sub(FIELD.pos).multiplyScalar(20);
  FIELD.intensity = Math.max(0, track(K.intensity, t));
  FIELD.radius = track(K.radius, t);
  FIELD.reach = clamp(track(K.reach, t), 0, 1);
  FIELD.dark = clamp(track(K.dark, t), 0, 1);
}

// Sample the force (here: a wind velocity in m/s) at a world point.
// Called tens of thousands of times per step — no allocation, write into `out`.
function sampleField(p, out) {
  const dx = p.x - FIELD.pos.x, dz = p.z - FIELD.pos.z;
  const r = Math.sqrt(dx * dx + dz * dz) + 1e-3;
  const V = FIELD.intensity, q = r / FIELD.radius;

  // Vortex placeholder: swap for your archetype.
  const surf = 0.62 + 0.38 * smooth(0, 18, p.y);          // ground friction
  const vt = V * 2 * q / (1 + Math.pow(q, 2.6)) * surf;   // tangential, peaks at the core radius
  const bl = Math.exp(-p.y / 45);                          // boundary layer
  const vr = -0.42 * vt * bl * smooth(0.35, 1.0, q);       // inflow drags debris in
  const core = Math.exp(-q * q * 0.6);
  const vu = (V * 0.55 * core + 0.32 * vt * bl) * smooth(0, 8, p.y + 2) * (FIELD.reach > 0.3 ? 1 : 0.4);

  const tx = dz / r, tz = -dx / r;                         // CCW tangent seen from above
  return out.set(tx * vt + (dx / r) * vr, vu, tz * vt + (dz / r) * vr);
}

const distToEvent = (x, z) => Math.hypot(x - FIELD.pos.x, z - FIELD.pos.z);
