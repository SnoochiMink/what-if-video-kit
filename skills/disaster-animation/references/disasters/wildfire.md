# Wildfire

## Field — spreading front plus fire-induced wind

A wildfire is unusual here because the fire **creates its own weather**. The fire draws air in
at ground level and pushes a convection column up, which then drives the spread. Coupling those
two is what makes a fire animation feel alive rather than like a texture crawling across a map.

```js
// indraft: air pulled toward the fire line at ground level
const toFire = tmp.subVectors(nearestFirePoint(p), p);
const d = toFire.length();
const indraft = FIELD.intensity * Math.exp(-d / 180) * Math.exp(-p.y / 40);
out.copy(toFire).normalize().multiplyScalar(indraft);
out.y += FIELD.intensity * Math.exp(-d*d / 6000) * 1.4;      // convection column
```

Spread rate depends on slope and wind, and the classic rule is that fire moves far faster
uphill. Roughly, rate doubles for every 10° of upslope. Spot fires start well ahead of the main
front from embers carried downwind, which is how fires jump rivers and highways.

Track a per-cell fuel load that burns down over time, so the fire passes through and leaves
black behind rather than staying lit everywhere.

## Visual signature

Orange-brown sky with the sun reduced to a dim red disc — the single most recognisable image of
a wildfire, and cheap to achieve with fog colour plus a dimmed directional light. Embers
streaming downwind. A pyrocumulonimbus column. Ash falling like grey snow. Everything backlit.

Burn progression on surfaces is what sells it: scorch, then char, then ash-grey, driven by a
per-object accumulated heat value.

## Destruction order

| Stage | Effect |
|---|---|
| Ember attack | spot fires in gutters, vents, decks — most homes are lost this way |
| Radiant heat | windows crack and fail, vinyl siding deforms |
| Direct flame | fences and decks ignite and carry fire to the structure |
| Structure fire | roof burns through, then collapse, leaving foundation and chimney |
| Burnout | only masonry, chimneys and vehicle shells remain |

Houses usually ignite from embers landing in vulnerable spots, not from a wall of flame
arriving. Animating ember attack *before* the front arrives is both accurate and more
interesting.

## Camera beats

Cold-open inside the firestorm with embers streaming past. A dry, normal afternoon with a
distant smoke column. The orange sky. Ember attack on a roof. The front arriving at the tree
line. Driving out through flame on both sides. The aftermath: chimneys standing in ash, a
burned-out car.

## Audio

A deep roar — brown noise lowpassed, closer to a jet engine than a campfire. Crackling and
popping from random one-shots. Trees exploding. Wind drawn toward the fire. The aftermath is
unnervingly quiet with occasional collapses, and that contrast is worth holding.

## Verified facts

- The 2018 Camp Fire destroyed about 18,800 structures and largely erased the town of Paradise,
  California.
- The Peshtigo Fire of 8 October 1871 killed an estimated 1,200–2,500 people in Wisconsin, the
  deadliest wildfire in US history.
- Large wildfires generate pyrocumulonimbus clouds that produce their own lightning, which can
  start further fires far ahead of the main front.
