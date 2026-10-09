# Tsunami and flood

## Field — advancing water surface

One height function is the source of truth for the surface mesh, the buoyancy and the drag.

```js
function waterHeightAt(x, z, t) {
  const s = x - FIELD.frontX;                          // distance ahead of the front
  const front = smooth(80, -20, s);                    // the wall of water
  const swell = Math.sin(x*0.02 - t*2.1)*0.6 + fbm(x*0.05, z*0.05, t*0.3)*0.4;
  return FIELD.base + front * FIELD.amp + swell * front;
}
```

Forces on a submerged object are drag from the flow plus buoyancy:

```js
const sub = clamp((h - p.y) / objHeight, 0, 1);
out.copy(flowVel).sub(obj.v).multiplyScalar(0.5 * 1000 * obj.cd * obj.A * sub / obj.m);
out.y += 1000 * obj.vol * sub * G / obj.m;             // buoyancy — this is why cars float
```

A tsunami is not a breaking wave. It is a fast, relentless rise that keeps coming for 30 s or
more, followed by an equally destructive **drawback** that drags everything out to sea. The
drawback is what most animations omit and what real footage is full of.

## Visual signature

The sea withdrawing first and exposing the seabed — the famous warning sign. A dark,
debris-laden front rather than blue water. Foam at the leading edge. Boats carried inland. A
floating raft of wreckage that becomes the real destructive agent. Everything is brown.

## Destruction order (flow depth)

| Depth | Effect |
|---|---|
| 0.5 m | people lose their footing |
| 1 m | cars float and drift |
| 2 m | timber buildings begin to fail, windows and doors blow in |
| 3–4 m | timber buildings washed off their foundations |
| >5 m | reinforced concrete damaged; only engineered structures survive |

Debris load matters more than depth. Once the flow carries cars and timber it batters
everything downstream, so couple debris collisions into the damage model.

## Camera beats

Cold-open on the wave hitting a seawall. A calm harbour. The drawback, with boats sitting on
mud. The front crossing the breakwater. Street level as water fills the frame. A rooftop
looking down on the raft of debris. The drawback pulling a town out to sea. The mud line on a
wall in the aftermath.

## Audio

Not a crash but a sustained low roar that builds over 20 s: brown noise lowpassed, plus
grinding debris, creaking and snapping timber. Alarms and sirens beforehand. During the
drawback, a sucking, draining texture. Near-silence in the drawback is extremely effective.

## Verified facts

- The 2004 Indian Ocean tsunami killed roughly 230,000 people across 14 countries.
- On 9 July 1958 a landslide into Lituya Bay, Alaska produced a wave that stripped forest up to
  about 524 m (1,720 ft) above sea level — the highest wave runup ever recorded.
- Tsunami waves cross open ocean at roughly 800 km/h, about the speed of a jet airliner, while
  being barely noticeable to a ship at sea.
