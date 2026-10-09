# Water surfaces

Water is the hardest surface in this genre to make read, and the failures are specific and
repeatable. This file is what a working tsunami build actually needed.

## One implementation, not two

The usual approach is to write the height expression twice — once in JS for the physics, once
in GLSL for the surface — and comment both "must match". They drift, and the symptom is the
signature tell of amateur work: debris riding a metre above or below the water it is supposed
to be floating on.

**Sample the JS height function on the CPU into a height texture each frame and have the shader
read that.** The GPU and the physics are then reading the same numbers by construction.

```js
// 80x80 over a 1500 m box is plenty: the large-scale surface is smooth, and
// the shader adds high-frequency chop that is too fine to matter to physics.
for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
  const h = waterHeightAt(x, z, t), g = groundHeightAt(x, z);
  d[k] = h; d[k+1] = highWater; d[k+2] = foam; d[k+3] = Math.max(0, h - g);
}
tex.needsUpdate = true;
```

Keep the box **anchored to the site, not the camera**. A camera-following box means texel
(i,j) maps to a different world point every frame, which silently corrupts any per-cell state
you accumulate in it — high-water marks especially, which smear across the terrain as the
camera moves.

## The three things that make depth readable

On a phone, reflections and refraction do almost nothing. In order of value:

1. **A foam line at the leading edge.** The single clearest cue for where the water currently
   reaches. Make it wide and asymmetric — whitewater trails behind a front, it does not run
   ahead of it.
2. **A wet/dry line** on everything the water has touched, from a per-cell high-water mark.
   Darken below it and add a bright mud line right at it. This is what makes an aftermath read
   as an aftermath.
3. **Opacity by depth.** A 20 cm sheet running down a street is nearly clear; you read it from
   the shine and the darkened ground beneath. Give shallow water a flat high alpha and the
   whole town turns into one blank sheet of colour with every depth cue gone.

```glsl
float a = smoothstep(0.02, 1.3, vDepth) * 0.80 + foam * 0.5;
```

Gate shallow-water foam on actual surge energy. A calm harbour has a quiet waterline; foaming
any shallow water blows the entire shoreline out to white before the wave even arrives.

## Normals, or it is brown paint

A fragment shader that lights the surface with a constant up-vector renders a perfectly flat
sheet no matter how much the vertices move. Take the **analytic derivative of the same chop the
vertex shader displaced by**, so the shading agrees with the silhouette:

```glsl
// vertex: p.y = h + chop(p.xz, t) * amp;
// fragment: the derivative of that same expression
float dx = (0.21*0.20*cos(p.x*0.21 + t*1.9) + ...) * amp;
float dz = (0.27*0.17*cos(p.y*0.27 - t*1.5) + ...) * amp;
vec3 N = normalize(vec3(-dx, 1.0, -dz));
```

Also take the large-scale slope from the height texture by finite difference. Steep water is
breaking water, so slope drives foam for free and the front reads as a *ramp* rather than a
flat sheet that happens to be high.

## Barriers actually have to hold water back

A seawall that the flow passes straight through is decorative in the simulation as well as on
screen. Model the inland surface as what got past the barrier:

```js
const over = Math.max(0, openHeightAt(x, gateZ, t - lag) - crest);   // head over the crest
const sub  = clamp(over / (crest - groundFlat), 0, 1);               // SUBMERGENCE
const trans = sub * sub * (3 - 2 * sub);
const sheet = groundHeightAt(x, z) + over * 0.55 * Math.exp(-(z - gateZ) / 260);
return lerp(sheet, open, Math.max(breach, trans));
```

**Submergence is the part that is usually missed.** A wall with a little water spilling over it
is a weir and passes a thin sheet. A wall with 4 m standing on top of 7 m of freeboard is
*drowned* — a submerged obstacle, not a barrier — and the flow crosses it almost freely.
Modelling overtopping as a weir alone under-floods the town by nearly an order of magnitude.

Getting this right also buys the best image in the genre: for a dozen seconds the sea stands
metres above the parapet while the street behind it is still dry.

## A town behind a wall fills like a reservoir

Better than the steady-state formula above, for a town enclosed by dikes: integrate one water
level `L(t)` for the enclosed area, once at load, on the simulation's own 1/60 s grid (so it
stays a pure function of time and seeking stays exact):

```js
const hin  = Math.max(0, open - Math.max(L, crest));   // pouring in over the wall
const hout = Math.max(0, L - Math.max(open, crest));   // pouring back OUT: the backwash
let dL = C * Math.pow(hin, 1.5) - C * Math.pow(hout, 1.5);   // weir law, C ~ 0.26 / area
if (L <= crest) dL -= (L - ground) * 0.0035;           // slow drain through gates and breaches
```

It gets three things right that the formula cannot: the town *fills* rather than switching on;
submergence emerges by itself as `L` approaches the open level; and when the sea drops, the
water pours back out over the same wall — the backwash that carried houses out to sea — before
leaving water standing in the streets for hours. Spread it spatially from the wall with a front
moving ~15 m/s from first overtopping, plus a jet term just behind the wall for the cascade.

Give the cascade over the parapet its own geometry (a strip from the parapet down the
embankment, streaks scrolling downslope, a bright broken lip): it is the defining image of
overtopping and a height texture at 5-6 m per texel cannot show a 4 m drop over 16 m.

## Colour and brightness

Brown, not blue. A disaster flood is an abrasive slurry of mud, timber and vehicles. Cap the
depth-darkening well short of black — real flood water stays muddy grey-brown at ten metres,
and a black surface reads as a hole in the world.

Two specific traps, both seen in practice:

- **Reflection turns it blue.** Under a blue sky, an untempered Fresnel reflection makes the
  whole surface blue-white at any grazing angle and the "black water" every witness describes
  disappears. Tint and dim the reflection (`refl * vec3(0.42, 0.37, 0.30)`) and scale F down
  with roughness — churning, foam-filmed water is not a mirror.
- **Too dark a body goes black after grading.** A scattering colour around 0.05 linear lands in
  the ACES toe and renders as a void once contrast and vignette are applied. In a linear HDR
  pipeline, ~0.11 linear (muddy brown, lit by sun and sky) reads as dark brown water.

Keep chop proportional to the setting: ocean-scale Gerstner amplitudes (~1 m) in a flooded
street look like swell rolling past a fourth-floor window. Street floods are turbulent, not
swelling — ~0.4 m at most.

Light debris floats; the old pattern of a separate GPU "mist" sheet is superseded by a lit
particle pool for spray (see `rendering.md` for the near-camera fade every such pool needs).
The leading edge seen from a distance is spray thrown up along the front line — emit along it;
that is the "white line on the water" eyewitnesses describe.

## Gotchas that cost real time

| Symptom | Cause |
|---|---|
| Water a few stops darker than the scene | A raw `ShaderMaterial` gets neither three's ACES tone map nor its sRGB output chunk. The real fix is a linear HDR pipeline with tone mapping in post (`rendering.md`), so the water shader writes linear radiance like everything else. Authoring "display-space" colours is a workaround that drifts |
| Debris on the water renders as a black carpet | `vertexColors: true` on box geometry with no colour attribute zeroes `instanceColor`. See `rendering.md` |
| Water in the wrong place, or absent at a second site | Double translation: the vertex shader places vertices at absolute world positions AND the mesh has a position. Keep the mesh at the origin |
| Camera underwater shows nothing readable | There is nothing to see from inside a flood. Stage the shot above it looking across |
| Whole shoreline pure white | Ungated shallow-water foam (see above) |
| Foam missing where water piles against a wall | Foam keyed only to the front position. The nominal front passes inland while the real waterline stands still at the barrier — add an explicit term there |
