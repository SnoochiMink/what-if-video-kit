# Cosmic disasters

Space scenarios need a different approach from terrestrial ones. The threat is usually
invisible, silent and absolute, so the drama comes from **the sky changing** and from people
realising something is wrong, rather than from debris physics. Lean on scale, light and silence.

## Black hole / rogue mass

### Field — gravity plus tidal stretching

```js
const d = Math.max(p.distanceTo(SING), 1);
const g = FIELD.GM / (d * d);                                  // pull
const tidal = 2 * FIELD.GM * objLength / (d * d * d);          // stretch along the radial axis
```

The signature is **tidal differential**, not the pull itself. Everything is stretched along the
line to the singularity and squeezed perpendicular to it, increasingly as it approaches. Apply
a non-uniform scale along that axis to objects and terrain.

### Visual signature

Gravitational lensing is the whole effect: the starfield and the horizon bend around a dark
circle, with an Einstein ring of light from behind. A screen-space radial distortion shader on
a render target gets you most of it. Add an accretion disc, visibly warped so you see its far
side above and below the hole.

Tides first show up as the ocean rising, then the atmosphere streaming away, then the ground
cracking along radial lines.

## Solar flare / coronal mass ejection

This one is the most realistic, and uniquely good for this format because it is **invisible**.

Timeline: a flare is seen on the Sun; light and X-rays arrive in 8 minutes; the CME takes
roughly 1–3 days. Then aurora appear at tropical latitudes, geomagnetically induced currents
saturate grid transformers, and the power goes out — permanently, in the worst case, because
large transformers take a year or more to replace.

The drama is entirely in **lights going out block by block** and an impossibly bright aurora
over a city that has no power. No physics needed; it is a lighting and emissive-material
problem. Animate the aurora as a scrolling vertical curtain shader, and kill emissive window
materials progressively across the city.

## Gamma-ray burst

A silent, instantaneous flash. Half the planet sees nothing. The visible effect is ozone
depletion over weeks, not immediate destruction, so this works best as an atmospheric colour
shift plus a slow-burn end card rather than a destruction sequence.

## Asteroid

See `impact.md`.

## Camera beats for cosmic scenarios

These need slower, wider framing than terrestrial disasters. Hold shots longer — about 3–4 s
rather than 1.5–3 s — because the awe comes from scale rather than from cutting.

Cold-open on the sky already wrong. Normal street with something subtly off above. A long tilt
up. Crowds standing still, all looking the same way — a very strong image. Wide city skyline
against the phenomenon. The moment it becomes undeniable. A final wide, quiet frame.

## Audio

Mostly silence, which is both accurate and unsettling. Build with a low drone that rises almost
imperceptibly, plus sub-bass that the viewer feels rather than hears. Human sounds — car
alarms, a distant siren, voices — carry everything. For a solar flare, the sound of a city
losing power: a hum that stops.

## Verified facts

- The Carrington Event of September 1859 induced currents strong enough to disrupt telegraph
  systems, and aurorae were reported close to the equator.
- Sagittarius A*, the supermassive black hole at the centre of the Milky Way, has a mass of
  roughly 4 million Suns and is about 26,000 light years away.
- Light from the Sun takes about 8 minutes 20 seconds to reach Earth, so any solar event is
  already over by the time it is seen.

## Relativistic speed, if the camera itself goes fast

For a scenario where the viewer is the fast-moving thing — near-light-speed travel, falling into
the hole, a relativistic jet — the numbers span ~20 orders of magnitude and are asymptotic at
*c*. Do **not** interpolate km/h or even v/c: you end up with a Newtonian branch and a
"how many nines" branch that disagree at the seam.

Interpolate **rapidity** `w = artanh(beta)` instead. It is unbounded, additive, smooth across the
whole range, and every readout falls out of it:

```js
const C_KMH = 299792458 * 3.6;
const beta  = w => Math.tanh(w);                 // v/c
const gamma = w => Math.cosh(w);                 // exact and stable to w ~ 700
const eps   = w => 2 / (Math.exp(2 * w) + 1);    // 1 - beta, where 1 - tanh(w) underflows
const wFromKmh   = v => Math.atanh(Math.min(v / C_KMH, 1 - 1e-16));
const wFromGamma = g => Math.acosh(Math.max(g, 1));
```

Author keyframes in human units (km/h or gamma), convert to `w`, and interpolate `log10(w)` —
linear in log space reads as exponential acceleration. Floor `w` at ~1e-12. Constant `dw/dt` is
constant proper acceleration; `dw/dt = ln(10)` multiplies gamma by exactly 10x per second, which
is the textbook relativistic rocket and a good climax law.

**Display the dilation, not the percentage.** Past about 12 nines the percentage-of-*c* readout
stops changing in any visible way — freeze it at `99.9999999999...%` and let the ellipsis do the
work. Move the drama to a `1 SECOND = <n> ON EARTH` line driven by gamma, stepping through
seconds, minutes, hours, days, years, million years. That line keeps climbing long after the
percentage saturates, and it is what lands the beat.

### Aberration and Doppler — cheap, and they are the whole look

**Star aberration** (beta >= ~0.5). Starlight bunches toward the direction of travel. For a star
at angle theta from the forward axis:

```js
const cosThetaPrime = (Math.cos(theta) - beta) / (1 - beta * Math.cos(theta));
```

Re-place each star at theta'. As beta -> 1 the entire sky collapses into a narrow forward cone —
a dense conical swarm crowding the centre while the periphery empties. This is the difference
between a relativistic shot and a generic starfield.

**Doppler ring** (beta >= ~0.9999). Drive hue from `D = 1 / (gamma * (1 - beta * cos(theta)))`
mapped across the visible spectrum. The resulting structure is counter-intuitive and is the
detail that makes it look researched — from the centre outward: a single white-blue point
(`#f2f1f4`), then a **dark near-black gap** with a faint blue cast (forward light has blueshifted
clean past visible), then amber, then red-pink (`#473039`), then magenta (`#462f37`), then black.
A dark centre with a coloured halo, not a bright bullseye.

At gamma >= ~1e10 the ring collapses to a blue-white orb at dead centre: `#edecf5` core falling
through `#9ca7bc`, `#616874`, `#1b1e24`, gone by ~190 px at 576 wide, hue holding ~219.

If the scenario goes faster than light by **moving space rather than the ship**, the field is a
lit **indigo** warp tunnel — streaks radiating from near centre frame, mean `#2d2c37`–`#3a3a49`,
streak peaks `#606079`–`#8988a0`, saturation ~0.20, roughly even brightness across radius with a
soft edge vignette. It is not a black starfield.

See the companion `pov-acceleration-sim` skill for a full measured timeline of an accelerate-to-
*c* journey, including act structure and HUD readout formatting.
