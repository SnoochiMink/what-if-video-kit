'use strict';
// =====================================================================
// DIRECTOR — camera shots, captions, counters, end card.
// Cold-open on the climax: ~65% of viewers leave in the first 3 seconds,
// and a slow establishing shot is the most reliable way to lose them.
// See references/direction.md.
// =====================================================================

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const eventAt = (y) => () => V(FIELD.pos.x, y, FIELD.pos.z);

const SHOTS = [
  // COLD OPEN — inside the disaster, title overlaid
  { t0: 0, t1: 2.2, p0: V(60, 9, 60), p1: V(52, 11, 52), g0: eventAt(60), g1: eventAt(80), f0: 58, f1: 54, hand: 1 },
  // cut to calm
  { t0: 2.2, t1: 8, p0: V(-30, 1.7, 55), p1: V(-26, 1.7, 52), g0: V(0, 6, 10), g1: V(4, 6, 6), f0: 50, f1: 48, hand: 1 },
  { t0: 8, t1: 16, p0: V(10, 1.6, 70), p1: V(8, 1.6, 66), g0: eventAt(90), g1: eventAt(110), f0: 52, f1: 46, hand: 1 },
  { t0: 16, t1: 26, p0: V(120, 2.0, 40), p1: V(126, 2.2, 36), g0: eventAt(80), g1: eventAt(95), f0: 46, f1: 42, hand: 1 },
  { t0: 26, t1: 36, p0: V(90, 45, -120), p1: V(70, 38, -140), g0: V(0, 20, 0), g1: V(10, 20, -10), f0: 48, f1: 48, hand: 0.5 },
  { t0: 36, t1: 46, p0: V(40, 3, 60), p1: V(46, 3.4, 54), g0: eventAt(50), g1: eventAt(60), f0: 54, f1: 52, hand: 1 },
  { t0: 46, t1: 56, p0: V(-80, 30, 90), p1: V(-66, 24, 78), g0: V(-10, 4, 10), g1: V(0, 3, 0), f0: 50, f1: 48, hand: 0.6 },
  { t0: 56, t1: 61.5, p0: V(-20, 6, 40), p1: V(-14, 10, 46), g0: V(0, 2, 6), g1: V(2, 2, 2), f0: 48, f1: 50, hand: 0.4 },
];

const CAPTIONS = [
  [2.2, 6.0, '4:52 PM. A <em>normal</em> afternoon.'],
  [6.0, 8.0, 'Then the sky turns <em>wrong</em>.'],
  [8.0, 12.0, 'It is still <em>miles</em> away.'],
  [12.0, 16.0, 'You have <em>minutes</em>.'],
  [16.0, 26.0, 'Get <em>underground</em>.'],
  [26.0, 36.0, 'It crosses the edge of town.'],
  [36.0, 46.0, 'Roofs go first. <em>Then the walls.</em>'],
  [46.0, 56.0, 'The street is <em>gone</em>.'],
];

const HOME = V(0, 0, 0);          // what "distance to you" measures against

const DIR = { shot: -1, cap: -1 };
const _cp = new THREE.Vector3(), _cg = new THREE.Vector3(),
      _e = new THREE.Euler(0, 0, 0, 'YXZ'), _dw = new THREE.Vector3();
const evalTarget = g => (typeof g === 'function' ? g() : g);

function updateCamera(t, camera) {
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1);
  if (i < 0) i = SHOTS.length - 1;
  const S = SHOTS[i];
  const u = clamp((t - S.t0) / (S.t1 - S.t0), 0, 1);
  const e = S.ease === 'out' ? 1 - Math.pow(1 - u, 2.6) : easeInOut(u) * 0.5 + u * 0.5;

  _cp.lerpVectors(S.p0, S.p1, e);
  _cg.lerpVectors(evalTarget(S.g0), evalTarget(S.g1), e);
  camera.position.copy(_cp);
  camera.lookAt(_cg);
  camera.fov = lerp(S.f0, S.f1, e);

  // Handheld: slow drift plus event-driven shake. Smooth noise, never per-frame random —
  // random jitter reads as a broken camera rather than a frightened operator.
  sampleField(_dw.set(_cp.x, Math.min(_cp.y, 20), _cp.z), _dw);
  const w = Math.hypot(_dw.x, _dw.z), d = distToEvent(_cp.x, _cp.z);
  const shake = clamp((w - 14) / 55, 0, 1) * 0.03 + clamp(1 - d / 260, 0, 1) * 0.02;
  const hand = 0.006 * (S.hand ?? 1);
  _e.setFromQuaternion(camera.quaternion);
  _e.y += noise1(t * 0.35 + 3) * hand + noise1(t * 11 + 1) * shake;
  _e.x += noise1(t * 0.30 + 9) * hand * 0.7 + noise1(t * 13 + 5) * shake;
  _e.z += noise1(t * 0.25 + 17) * hand * 0.5 + noise1(t * 9 + 7) * shake * 0.6;
  camera.quaternion.setFromEuler(_e);
  camera.updateProjectionMatrix();
  camera.userData.target = _cg.clone();
  DIR.shot = i;
}

function updateHUD(t, el) {
  el.hook.classList.toggle('on', t < 2.2);
  el.counters.classList.toggle('on', t >= 2.2 && t < 56);

  const ci = CAPTIONS.findIndex(c => t >= c[0] && t < c[1]);
  if (ci !== DIR.cap) {
    DIR.cap = ci;
    if (ci < 0) el.caption.innerHTML = '';
    else {
      // Per-word stagger: draws the eye and reads as energy on a muted phone.
      const words = CAPTIONS[ci][2]
        .replace(/<em>(.*?)<\/em>/g, (m, a) => a.split(' ').map(w => '\u0001' + w).join(' '))
        .split(' ');
      el.caption.innerHTML = words.map((w, k) =>
        `<span class="${w[0] === '\u0001' ? 'em' : ''}">${w.replace('\u0001', '')}</span>`
      ).join(' ');
    }
    el.capSpans = el.caption.querySelectorAll('span');
  }
  // Per-word pop as a PURE FUNCTION OF FILM TIME. A CSS animation runs on the
  // wall clock, so exported frames catch words half-faded and the same frame
  // rendered twice does not match.
  if (ci >= 0 && el.capSpans) {
    const t0 = CAPTIONS[ci][0], t1 = CAPTIONS[ci][1];
    const out = 1 - smooth(t1 - 0.25, t1, t);
    el.capSpans.forEach((sp, k) => {
      const a = clamp((t - t0 - k * 0.07) / 0.28, 0, 1);
      const e = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);   // overshoot
      sp.style.opacity = (Math.min(1, a * 1.6) * out).toFixed(3);
      sp.style.transform = `translateY(${((1 - a) * 1.5).toFixed(3)}cqw) scale(${(0.7 + 0.3 * e).toFixed(3)})`;
    });
  }

  const dm = Math.hypot(FIELD.pos.x - HOME.x, FIELD.pos.z - HOME.z);
  const ft = dm * 3.28084;
  el.dist.textContent = ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(dm / 1609.34).toFixed(2)} mi`;
  el.distBox.classList.toggle('hot', ft < 1500);

  const mph = FIELD.intensity * 2.23694;
  el.main.textContent = t < 8 ? '—' : `${Math.round(mph)} mph`;
  el.lost.textContent = WORLD.destroyed;
  el.end.classList.toggle('on', t >= 56);
}
