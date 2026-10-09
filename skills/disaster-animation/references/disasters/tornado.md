# Tornado

## Field — vortex

Rankine-style tangential profile plus ground inflow and a core updraft. Cyclonic
(counter-clockwise seen from above) in the Northern Hemisphere.

```js
const q = r / rCore;
const surf = 0.62 + 0.38 * smooth(0, 18, p.y);        // friction slows the lowest metres
const vt = Vmax * 2 * q / (1 + Math.pow(q, 2.6)) * surf;
const bl = Math.exp(-p.y / 45);
const vr = -0.42 * vt * bl * smooth(0.35, 1.0, q);    // inflow
const vu = (Vmax * 0.55 * Math.exp(-q*q*0.6) + 0.32 * vt * bl) * smooth(0, 8, p.y + 2);
```

Keyframe `Vmax` from 0 to about 104 m/s at 43 s, then decaying; `rCore` from 7 to 46 m, since
it widens as it matures; a `condense` gate from 0 to 1 over ~4 s as the funnel reaches the
ground; and a snaking wobble that is large early and small at peak. Storm motion ~16 m/s.

## Visual signature

Green-black sky with a bright clear slot behind it. A rotating wall cloud lowered beneath the
cloud base. The condensation funnel descends *before* it reaches the ground, and the debris
cloud at the base forms separately — browner and wider than the funnel itself. Cap the funnel
at the cloud base; it must never punch through.

## Destruction order (EF scale, 3-second gust at 10 m)

| m/s | mph | EF | Damage |
|---|---|---|---|
| 29–38 | 65–85 | EF0 | shingles strip, branches break, gutters go |
| 38–49 | 86–110 | EF1 | windows blow in, carports fail, mobile homes overturn |
| 50–60 | 111–135 | EF2 | roof decks lift, large trees snap, cars slide |
| 61–74 | 136–165 | EF3 | exterior walls fail, trains overturn |
| 74–89 | 166–200 | EF4 | well-built houses levelled |
| >89 | >200 | EF5 | houses swept off slabs, cars thrown over 100 m |

Walls must only fail *after* the roof has gone — the roof diaphragm is what braces them.

## Camera beats

Cold-open inside the wedge. Yard-level calm. The funnel appearing over rooftops. Sirens and the
run for shelter. A chaser's shaky telephoto from a mile out. Ground level as it crosses the
street. Overhead of the damage path. Survivors emerging onto a bare slab.

## Audio

Wind bed rising into a freight-train roar (brown noise, lowpass 90–350 Hz, plus a 34 Hz sub)
scaled by proximity squared. A civil defence siren wailing on a 7.5 s cycle that winds down
when the power line falls. Thunder delayed by distance. Birdsong before, cut abruptly when the
sky turns.

## Verified facts

- On 3 May 1999 near Bridge Creek–Moore, Oklahoma, a Doppler on Wheels radar measured winds of
  about 301 mph (±20) — among the highest wind speeds ever recorded on Earth.
- The Tri-State Tornado of 18 March 1925 killed 695 people across Missouri, Illinois and
  Indiana, the deadliest single tornado in US history.
- The El Reno, Oklahoma tornado of 31 May 2013 reached about 2.6 miles wide, the widest ever
  recorded.
