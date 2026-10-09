# Hurricane / typhoon / cyclone

## Field — large slow vortex plus storm surge

Same vortex maths as a tornado but two orders of magnitude larger and slower, so it feels
completely different: sustained rather than sudden, and lasting hours instead of seconds.

```js
// radius of maximum wind is tens of km, not tens of metres
const q = r / FIELD.rmw;
const vt = Vmax * Math.pow(q, 0.5) / (1 + Math.pow(q, 1.6));   // broad, flat-topped profile
// asymmetry: forward motion adds on the right side of the track (Northern Hemisphere)
out.addScaledVector(FIELD.vel, 0.8 * Math.exp(-r / (FIELD.rmw * 3)));
```

The surge is usually the real killer, and it is a separate system: water piled up by wind
stress and low pressure, arriving over hours. Treat it as a slow version of the tsunami height
field in `tsunami.md`, superimposed with wind-driven waves on top.

## Visual signature

Rain moving horizontally. Trees bent over and holding that bend rather than whipping. Spray and
debris in sustained flight. Low, fast scud clouds beneath the main deck. Then the **eye**: wind
drops to near-nothing, blue sky overhead, an eerie calm — followed by the back wall hitting
from the opposite direction. That reversal is the signature beat and almost no animation does
it.

## Destruction order (Saffir–Simpson, sustained winds)

| Category | mph | Effect |
|---|---|---|
| 1 | 74–95 | gutters, shingles, branches down, power outages |
| 2 | 96–110 | major roof and siding damage, shallow trees uprooted |
| 3 | 111–129 | roof decking and gable ends removed |
| 4 | 130–156 | severe roof structure loss, most trees snapped, power out for weeks |
| 5 | 157+ | high percentage of framed homes destroyed, total roof failure |

Surge depth drives the rest: 1 m floats cars, 2 m fails timber walls, 4 m washes buildings off
foundations. Most hurricane destruction is water, not wind.

## Camera beats

Cold-open in the eyewall. Boarded-up windows and a quiet street. The first bands arriving. A
palm bent to 45 degrees. Surge rising up a street, car by car. The eye — sudden silence, people
stepping outside, the camera tilting up to blue sky. The back wall arriving from the opposite
direction. Aerial of the flooded town.

## Audio

A sustained, unvarying roar — unlike a tornado it never peaks, which is psychologically very
different. Rain on glass. Debris impacts. In the eye: near-total silence with birds, which is
the strongest audio moment available in this disaster. Then the back wall, abruptly.

## Verified facts

- Hurricane Katrina in 2005 produced a storm surge reaching roughly 28 ft along the Mississippi
  coast, among the highest recorded in the United States.
- Hurricane Patricia in 2015 reached sustained winds of about 215 mph, the strongest ever
  reliably measured in the Western Hemisphere.
- Typhoon Tip in 1979 had a circulation roughly 1,380 miles across, about half the width of the
  contiguous United States.
