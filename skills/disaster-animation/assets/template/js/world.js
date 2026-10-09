'use strict';
// =====================================================================
// WORLD — terrain and everything destructible.
// This is a minimal placeholder town so the scaffold renders immediately.
// Replace with real procedural buildings; see references/architecture.md.
// =====================================================================

const WORLD = { buildings: [], destroyed: 0, total: 0 };

function buildWorld(scene) {
  WORLD.scene = scene;

  const grass = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#5d7a3a', 0.16, 6);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `hsla(${80 + RNG() * 30},${35 + RNG() * 25}%,${22 + RNG() * 22}%,0.5)`;
      g.fillRect(RNG() * w, RNG() * h, 1.5, 4 + RNG() * 4);
    }
  }, { repeat: true });
  grass.repeat.set(120, 120);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // A grid of simple buildings, each split so parts can fail independently.
  const SIDING = ['#e9e5da', '#c9d4d8', '#d9c9a6', '#9fb4c4', '#b6baa3', '#e4d4c2'];
  const ROOFS = ['#3a3a3c', '#4b4541', '#5a4a3f', '#30353a'];
  for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
    if (RNG() < 0.25) continue;
    const x = gx * 34 + rr(-3, 3), z = gz * 30 + rr(-3, 3);
    const W = rr(10, 14), D = rr(8, 10.5), H = rr(2.7, 3.2);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = RNG() < 0.5 ? 0 : Math.PI;
    scene.add(g);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.42, D + 0.5), stdMat('#b4b1aa'));
    slab.position.y = 0.21; slab.receiveShadow = slab.castShadow = true; g.add(slab);

    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), stdMat(rpick(SIDING)));
    body.position.y = 0.42 + H / 2; body.castShadow = body.receiveShadow = true; g.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(W, D) * 0.75, 2.6, 4),
      stdMat(rpick(ROOFS)));
    roof.rotation.y = Math.PI / 4; roof.scale.z = D / W;
    roof.position.y = 0.42 + H + 1.3; roof.castShadow = true; g.add(roof);

    // Real thresholds with per-object jitter, so a street fails raggedly rather than in unison.
    const j = () => 0.9 + RNG() * 0.22;
    WORLD.buildings.push({
      g, x, z, body, roof, slab,
      t: { roof: 50 * j(), walls: 64 * j() },
      roofGone: false, dead: false,
    });
  }
  WORLD.total = WORLD.buildings.length;
}

const _wp = new THREE.Vector3(), _ww = new THREE.Vector3();
function stepWorld(dt, t) {
  for (const b of WORLD.buildings) {
    if (b.dead) continue;
    if (distToEvent(b.x, b.z) > 400) continue;
    _wp.set(b.x, 4, b.z); sampleField(_wp, _ww);
    const w = Math.hypot(_ww.x, _ww.z);

    // Order matters: the roof is what braces the walls, so it must go first.
    if (!b.roofGone && w > b.t.roof) { b.roofGone = true; b.roof.visible = false; }
    if (b.roofGone && w > b.t.walls) {
      b.dead = true; b.body.visible = false; WORLD.destroyed++;
    }
  }
}

function writeWorld(t) { /* per-frame visual updates go here */ }
