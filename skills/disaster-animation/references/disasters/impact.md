# Asteroid or meteor impact

## Field — blast wave plus thermal pulse

Three phases, separated in time. Separating them is what makes an impact read as real rather
than as a cartoon explosion.

1. **Entry** — a fireball crossing the sky with a smoke trail, seconds before anything else.
2. **Flash** — light arrives instantly. A white-out, then a thermal pulse that ignites and
   scorches. Nothing has moved yet.
3. **Shock** — the blast wave arrives at the speed of sound, `distance / 343` seconds later.

```js
const d = p.distanceTo(IMPACT);
const front = FIELD.blastR;                            // grows fast, then decelerates
const w = (d - front) / FIELD.thickness;
const over = Math.exp(-w * w) * FIELD.peak / (1 + d*d / 4e4);
const sign = w > 0 ? 1 : -0.35;                        // suction behind the front
out.copy(p).sub(IMPACT).normalize().multiplyScalar(over * sign);
```

The negative phase behind the front — debris sucked back toward the impact — is a strong and
rarely animated detail.

Also model **ejecta**: material thrown up on ballistic arcs that falls back over the following
seconds, and for larger impacts re-enters as a sky full of glowing streaks.

## Visual signature

A silent flash first. Windows flex before they break. Trees and poles all fall *radially away*
from the impact, which is the signature pattern in Tunguska photographs. A mushroom column of
dust and vapour. Then an expanding ring of dust racing outward along the ground, often visible
before anything in the foreground moves.

## Destruction order (overpressure)

| kPa | psi | Effect |
|---|---|---|
| 1 | 0.15 | windows crack |
| 3–7 | 0.4–1 | windows shatter; most injuries come from flying glass |
| 7–14 | 1–2 | roof damage, doors blown in, light structures fail |
| 35 | 5 | most residential buildings collapse |
| 70+ | 10+ | reinforced structures fail; near-total destruction |

Glass is the key one. At city scale, most casualties in a real airburst come from people
standing at windows that fail seconds after the flash draws them there.

## Camera beats

Cold-open on the shockwave crossing the skyline. A normal street, the flash, everyone turning.
A beat of silence while light outruns sound. The shock arriving and glass exploding outward.
The radial tree-fall from above. Ejecta re-entering across the sky. A crater rim at dawn.

## Audio

The critical beat is the **delay**. Flash, then near-silence with ambient room tone for several
seconds, then an enormous low boom (brown noise, lowpass ~140 Hz, 2.5 s) with a white crack on
the leading edge and a long rolling tail. For a distant airburst, the delay can be 30+ seconds
and holding that silence is the most effective thing in the entire video.

## Verified facts

- The Chicxulub impactor, roughly 10–15 km across, struck about 66 million years ago and left a
  crater around 180 km wide.
- The 1908 Tunguska event flattened an estimated 80 million trees over roughly 2,000 km² of
  Siberian forest, with no crater — it was an airburst.
- The 2013 Chelyabinsk meteor, about 20 m across, injured roughly 1,500 people, the great
  majority from glass broken by the airburst rather than by the meteor itself.
