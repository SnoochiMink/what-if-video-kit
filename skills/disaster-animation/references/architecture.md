# Procedural architecture

Buildings are the thing being destroyed, so they carry the emotional weight of the whole video.
They need to be recognisable at a glance, cheap enough to have hundreds, and built out of parts
that can come off individually.

## The governing constraint: build for the break

Design every structure around how it will fail. A building modelled as one solid box can only
vanish. A building modelled as slab + four walls + two roof panels + a merged trim mesh can
lose its shingles, then its windows, then its roof, then its walls, in that order, leaving a
bare foundation — which is the money shot of the entire genre.

So the split is always:

| Part | Why separate |
|---|---|
| Foundation / slab | survives everything; it is what remains at the end |
| Walls (one mesh each) | fail individually and directionally |
| Roof panels (2+) | the first large piece to leave; windward side first |
| Chimney, spire, antenna | small high-mass pieces that topple early and read well |
| Trim (merged) | windows, doors, porch, shutters — one vertex-coloured mesh, hidden on collapse |

Everything that is *not* going to detach gets merged into a single vertex-coloured geometry.
That is the difference between 8 draw calls per house and 40.

## Vertex colours instead of materials

A town of 200 houses with 6 materials each is 1,200 material binds. Instead, merge geometry and
bake colour into vertices, then use one shared `MeshStandardMaterial({ vertexColors: true })`.

```js
function mergeGeoms(list) {   // [{ geo, color, matrix }]
  // non-indexed, concatenate position/normal/uv, write a flat colour per source geometry
}
const trim = new THREE.Mesh(mergeGeoms(parts), stdMat('#fff', { vertexColors: true }));
```

Cache materials by their parameters so identical ones are shared:

```js
const MAT = {};
function stdMat(color, opts = {}) {
  const key = color + JSON.stringify(opts, (k, v) => v?.isTexture ? v.uuid : v);
  return MAT[key] ||= new THREE.MeshStandardMaterial({ color, roughness: .85, ...opts });
}
```

## Procedural textures beat image files

Generate everything on a `<canvas>`: siding courses, shingle rows, brick, asphalt with lane
markings, concrete, corrugated metal, glass curtain wall. No external files means the page
works from `file://`, the headless harness needs no asset server, and you can parameterise
colour per building.

```js
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;   // default is ClampToEdge!
  t.anisotropy = 8;
  return t;
}
```

**The wrap trap.** `CanvasTexture` defaults to `ClampToEdge`. Any geometry whose UVs leave 0..1
— which includes every `ShapeGeometry`, and any plane you scaled UVs on — renders as a smeared
edge pixel instead of a tiled texture. It looks like flat colour, not like an error. If a
surface mysteriously goes flat, check wrapping first.

## Building archetypes

### Detached house

Parameterise width, depth, storeys, roof pitch, siding colour, roof colour, garage yes/no,
porch yes/no. Gable walls use an extruded `Shape` with the peak built in, so the wall and its
gable are one breakable piece.

```js
function wallGeo(w, h, gable) {
  const s = new THREE.Shape();
  s.moveTo(0,0); s.lineTo(w,0); s.lineTo(w,h);
  if (gable > 0) s.lineTo(w/2, h + gable);
  s.lineTo(0,h); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
}
```

Windows are four quads: white frame, dark glass inset ~12 mm, two mullion strips. Cheap, and
the inset is what stops them reading as stickers. Shutters are a strong, nearly free identity
cue — half the houses get them in a random accent colour.

### Row of shops / main street

A continuous facade with a parapet hiding a flat roof, plus a repeated sign band and awnings.
Fails differently from a house: the parapet and signage go first, then the glazing, then the
roof deck drops *inward*, which is a distinct and recognisable silhouette.

### Mid-rise block

Floor slabs plus a curtain-wall shell. Build one floor's geometry and instance it vertically.
Model the lower two floors in more detail — that is all the camera sees at street level.

Under lateral load these fail by *storey*: one floor pancakes and the mass above drops onto the
next. Animating a single-storey collapse that cascades upward is far more convincing than
tipping the whole tower over.

### Tower / skyscraper

A tapering extrusion with a setback or two, a crown, and an emissive window grid. For glass,
one instanced quad per window lit with a random on/off pattern is cheaper and better-looking
than a texture, and lets you shatter windows individually as a shockwave passes.

The one thing that sells scale: put something of known size against it — a car, a bus, a person
— in the same frame.

### Infrastructure

Water towers, bridges, pylons, overpasses, grain silos, church spires. These are the
*landmarks*, and they do disproportionate narrative work: one recognisable silhouette falling
communicates more than fifty anonymous houses. Give each a dedicated toppling animation with a
hinge, an accelerating rotation, and a large dust burst plus a low boom at impact.

## Laying out a town

Grid streets, blocks between them, lots along each block, houses facing the street. The
important part is **irregularity**: jitter position and rotation slightly, skip ~40 % of
outer-block lots so the town fades into countryside, and carve out parks, a church lot and a
school. A perfect grid reads as a tech demo.

```js
for (const streetZ of STREETS_Z) for (const side of [-1, 1]) {
  const z = streetZ + side * 16, rotY = side < 0 ? 0 : Math.PI;   // face the street
  for (let b = 0; b < BLOCKS; b++) for (let lot = 1; lot <= 3; lot++) {
    const x = blockX(b) + lot * 20;
    if (isOuter(b) && rand() < 0.45) continue;                     // thin the edges
    buildHouse(x + rr(-1.5, 1.5), z + rr(-0.8, 0.8), rotY);
  }
}
```

Then dress it: driveways with a parked car, yard trees behind and in front, power lines along
one street, sidewalks, a water tower. The dressing is most of what makes it feel inhabited,
and all of it is destructible content later.

**Keep props out of the lens.** Camera shots are fixed, so a tree spawned at the camera's
position blocks the shot permanently. Filter spawns against the shot list:

```js
function nearCamera(x, z, r) {
  return SHOTS.some(s => [s.p0, s.p1].some(p => p.y < 25 && Math.hypot(p.x-x, p.z-z) < r));
}
if (onRoad(x, z) || nearCamera(x, z, 9)) return;
```

## Terrain and holes

Ground is usually a large textured plane. But a plane cannot contain an opening — a storm
cellar, a subway entrance, a sinkhole, a crater — because nothing below it is visible from
above. For that, build the ground as a `Shape` with `holes`:

```js
const s = new THREE.Shape();  /* outer rectangle */
const hole = new THREE.Path(); /* the opening, wound opposite */
s.holes.push(hole);
const g = new THREE.ShapeGeometry(s);
// ShapeGeometry UVs are in SHAPE UNITS, not 0..1 — normalise or the texture tiles wrongly
const uv = g.attributes.uv;
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
g.rotateX(-Math.PI / 2);
```

Two gotchas, both of which produce "it just looks flat" rather than an error. A mesh rotated
`-π/2` about X maps shape `(x, y)` to world `(x, 0, −y)`, so hole coordinates need the z
negated. And because UVs then centre on zero and go negative, the texture **must** be set to
`RepeatWrapping`.

## Interiors, cheaply

You rarely need real interiors. What you need is for openings to not look like stickers:

- A flat near-black quad set back behind every window gives instant depth.
- A doorway is a dark quad plus a jamb and lintel — three boxes.
- When a wall is torn away mid-video, reveal a merged "contents" cluster: furniture-coloured
  boxes, insulation pink, timber studs. It only needs to survive a second of screen time.

A point light inside a stairwell or doorway costs one light and makes an opening read as a
space rather than a hole painted black.
