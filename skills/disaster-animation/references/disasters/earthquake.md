# Earthquake

## Field — ground displacement

The ground is a moving reference frame, not a force. Everything resting on it inherits the
ground's **acceleration**; anything airborne does not.

```js
function groundDisp(p, t, out) {
  const d = Math.hypot(p.x - EPI.x, p.z - EPI.z);
  const u = t - d / 3500;                             // S-waves travel ~3.5 km/s
  if (u < 0) return out.set(0, 0, 0);
  const env = Math.exp(-u / FIELD.decay) * (1 - Math.exp(-u / 0.6));
  return out.set(Math.sin(u*7.1)*0.9, Math.sin(u*4.3)*0.35, Math.cos(u*6.2)*0.8)
            .multiplyScalar(env * FIELD.amp / (1 + d / 8000));
}
```

P-waves arrive first at about 6 km/s as a sharp vertical jolt, then the destructive S-waves,
then long slow surface waves. Staging those three arrivals is the entire drama: a rattle, a
pause, then the real thing.

Apply the ground transform to the terrain mesh **and** as a pseudo-force on every grounded
object, so nothing visually detaches from the floor. Toppling comes from the second derivative
of displacement, which is why tall slender objects fall first.

## Visual signature

Dust shaken loose from every surface before anything actually falls. Hanging objects and power
lines swing. Water slops in pools. Then fissures open, roads offset across the fault, and
buildings fail storey by storey rather than tipping over. Liquefaction tilts whole buildings
intact while cars sink into the ground.

## Destruction order (peak ground acceleration, fraction of g)

| PGA | Effect |
|---|---|
| 0.02–0.05 | hanging objects swing, dust falls, loose items rattle |
| 0.05–0.10 | unsecured furniture topples, plaster cracks, windows break |
| 0.10–0.30 | unreinforced masonry parapets and chimneys fail |
| 0.30–0.60 | soft-storey collapse, infill walls fall out, facades peel away |
| >0.60 | pancake collapse, bridge spans unseat |

Chimneys and parapets are the earliest readable failures — model them as separate bodies.

## Camera beats

Cold-open on a street mid-collapse. Interior: a glass sliding across a table. The jolt. Street
level as facades come down. A locked security-camera angle, which reads as found footage.
Overhead of the offset road. An aftershock during the quiet aftermath.

## Audio

A deep sub rumble that *precedes* the shaking by about a second. Structural groaning from brown
noise through a slow resonant filter sweep. Glass, masonry and alarms. Then the distinctive
aftermath: car alarms, dogs barking, and no traffic at all.

## Verified facts

- The 1960 Valdivia earthquake in Chile, magnitude 9.5, is the most powerful earthquake ever
  instrumentally recorded.
- The 2011 Tohoku earthquake shifted Japan's main island about 2.4 m east and moved the Earth's
  axis by an estimated 10–25 cm.
- Seismic waves from large earthquakes pass through the entire planet and are detected by
  seismometers on the opposite side.
