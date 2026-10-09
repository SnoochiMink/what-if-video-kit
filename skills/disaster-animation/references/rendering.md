# Rendering: from "computed" to "photographed"

The difference between a render that reads as a 3D scene and one that reads as footage is
almost entirely in this file, not in geometry. A user's verdict on a geometrically decent
first cut was "the colours are all bland". These are the changes that fixed it, in order of
impact.

## 1. A linear HDR pipeline, tone mapped once

Render the scene **linear and unclamped** into a half-float target, then do everything that
makes an image look photographed in one final pass:

```
scene (linear HDR, MSAA) -> bright pass -> bloom down/up chain -> composite:
    + bloom  -> exposure -> ACES -> grade -> vignette / aberration -> sRGB -> grain
```

```js
renderer.toneMapping = THREE.NoToneMapping;      // post does it
renderer.outputEncoding = THREE.LinearEncoding;  // post does it
const sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
```

With tone mapping in post, **every custom `ShaderMaterial` writes linear radiance**, the same as
the built-in materials. The alternative — leaving ACES on the renderer and authoring each
custom shader in "display space" — means every raw shader has to guess at a curve it never
receives, and each one comes out a few stops wrong in a different direction. One curve, applied
once, to everything.

Bloom: a soft-knee bright pass (threshold ~1.1 linear) then a dual-filter (Kawase) down/up
chain over ~6 mips. Wide, smooth and cheap. Clamp the bright pass (`min(c, 40.0)`) so a single
specular firefly cannot flood the frame.

## 2. The grade is what turns "grey" into "cinematic"

After ACES, in display space:

```glsl
c = mix(vec3(luma), c, 1.3);                     // saturation
c = (c - 0.5) * 1.1 + 0.5;                       // contrast about mid-grey
c += shadowTint * (1.0 - smoothstep(0.0, 0.55, luma))   // teal shadows
   + highTint  * smoothstep(0.45, 1.0, luma);           // warm highlights
```

Split toning (cool shadows, warm highlights) is the cheapest single "intentional colour" lever
there is. Then a gentle vignette (~0.25), chromatic aberration growing toward the edges, and
grain **after** sRGB encoding so it sits evenly across the tonal range.

**Watch the toe.** ACES plus contrast plus vignette crushes anything below about 0.1 linear to
near-black. A material that is "dark brown" at 0.1 renders as a black void. When something
dark looks like a hole in the image, output its raw value as the fragment colour for one frame
(`gl_FragColor = vec4(body * 4.0, 1.0)`) — if it is brown there, the problem is exposure, not
the shader. Brighten it ~2x rather than lowering the grade for everything.

## 3. A physically based sky, with the sun where it actually was

Preetham's analytic sky (the model in three.js' `Sky` example) plus a lit cloud layer beats any
hand-made gradient. Put the sun at the real position for the place and time — it decides
whether the subject is front-lit or a silhouette:

```
declination(day) ≈ -23.44° · cos(2π (day + 10) / 365)
solar time = clock + (longitude - zone_meridian) · 4 min + equation_of_time
hour angle H = (solar_time - 12 h) · 15°
sin(alt) = sin φ sin δ + cos φ cos δ cos H
cos(az)  = (sin δ - sin(alt) sin φ) / (cos(alt) cos φ)      // from north; afternoon: 360° - az
```

Miyako, 39.6°N, 15:20 JST, 11 March → altitude 24°, azimuth 243° (WSW). Looking out to sea
(east) the sun was behind the viewer, low and warm, front-lighting the wave against the deep
blue of the anti-solar sky. That is the most legible light possible for a dark wall of water,
and it came free from getting the astronomy right.

## 4. Image-based lighting from that sky

Bake the sky to a cube and prefilter it:

```js
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
new THREE.CubeCamera(0.1, 1000, cubeRT).update(renderer, skyOnlyScene);
scene.environment = new THREE.PMREMGenerator(renderer).fromCubemap(cubeRT.texture).texture;
```

Every `MeshStandardMaterial` is then lit by the actual sky — shaded faces pick up blue
skylight, sunlit faces warm sun, metal car bodies reflect the sky. This replaces the flat
ambient term that makes untextured geometry look like clay. Drop the hemisphere light to a
faint ground bounce.

**CLAMP THE SKY.** Preetham's sun disk reaches ~250,000 in linear units, which overflows a
half-float target (max 65,504) to infinity. PMREM then blurs infinity into every sample and
**every lit material in the scene renders black**, with no error. The sky itself still looks
fine, which is what makes this so confusing. `gl_FragColor = vec4(min(c, vec3(40.0)), 1.0)`.
Diagnose with a `?noenv` flag that sets `scene.environment = null` — if geometry reappears,
the environment is poisoned.

## 5. Draw calls: atlas whatever is unique

A `BoxGeometry` with a six-material array costs **six draw calls**. Ninety concrete buildings
built that way is 540 calls before anything else is drawn. Instead:

- draw every building's facade into one shared canvas atlas (shelf-pack them, ~30 px per floor
  and ~26 px per bay is plenty), remap each box face's 0..1 UVs into its atlas cell (roof faces
  into a plain cell), and merge them all into **one mesh**;
- do the same for shop signs (a second atlas, both faces of blade signs).

776 → ~480 draw calls in one change, most of the rest being animated people.

## 6. Silent instancing and material traps

| Symptom | Cause |
|---|---|
| A whole forest, or every vending machine, randomly missing | In three.js ~r149 an `InstancedMesh` is frustum-culled by its **base** geometry's bounds — one tree at the origin. When the origin is off-screen, all instances vanish. Set `frustumCulled = false` on every scattered instanced mesh |
| Instanced debris all renders black | `vertexColors: true` on a geometry with **no colour attribute**: WebGL reads the missing attribute as zero, which multiplies away `instanceColor`. Use `vertexColors: false` — `instanceColor` works on its own. Also initialise `instanceColor` to 1, not 0, or unset instances are black |
| A long road or parapet is streaked | A box's 0..1 UVs stretch one texture across 1.3 km. Re-project UVs from world position along each vertex's dominant normal axis (`worldUV(geo, 4)`) |
| A long road turns sky-blue | Grazing-angle Fresnel picking up the sky through IBL. `envMapIntensity: 0.35`, roughness ~0.97 |
| Rotations elsewhere subtly wrong | `euler.set(x, y, z, 'YXZ')` on a **shared** scratch Euler changes its order for every other user. Give special-order rotations their own Euler |
| Soft white mush filling the frame near the camera | Particles a metre from the lens. Fade alpha by view depth: `a *= smoothstep(1.5, 9.0, -mvPosition.z)` |

## 7. Terrain resolution where the profile changes

A uniform terrain grid either melts a 16 m-wide dike into a hump or costs a million vertices.
Build the grid from explicit axis coordinate lists — 1.2 m spacing across dikes and riverbanks,
4 m over the town, 9-10 m over distant hills — and index it yourself. Blend between formulae
(seabed and land, for instance) with a smoothstep across the boundary: switching at a line
leaves a vertical cliff wherever nothing happens to stand on that line to hide it.

## 8. Radial zoom blur, centred on the event

A uniform blur reads as an out-of-focus lens; a **radial zoom blur centred on the thing rushing
at you** reads as speed. Project the event's world position to screen space and use that as the
blur centre (for a POV outrun shot, the vanishing point — the point the camera is travelling
toward — not the frame centre).

8–12 taps along the ray from the centre, spread scaling with the log of the relative speed:

```glsl
vec2 dir = uv - uCenter;
vec3 sum = vec3(0.0); float wsum = 0.0;
for (int i = 0; i < 10; i++) {
  float f = float(i) / 9.0;
  float w = 1.0 - f * 0.6;                       // weight the unsmeared sample highest
  sum += texture2D(tDiffuse, uv - dir * f * uSpread).rgb * w;
  wsum += w;
}
c = sum / wsum;
```

`uSpread` is where the craft is. The useful shape, measured off a reference render as Laplacian
sharpness by radius (centre band : outer band):

| Regime | centre : outer | Reads as |
|---|---|---|
| at rest | 6.9x | normal lens, centre crisp |
| moderate | 2.9–3.5x | periphery smears hard, **centre still legible** |
| extreme | 0.8x | parity — the whole frame is going |
| overwhelmed | 0.1x | centre dissolves last; total wash |

So hold the centre comparatively sharp for most of the build, and only let it dissolve at the
peak. Blowing the centre early throws away the one place the viewer is reading.

Two traps. `filter: blur()` in CSS is display-only — it does **not** appear in a captured or
screenshotted frame; do it in the shader, or in a 2D context via `ctx.filter`. And this belongs
in the post chain next to the lens stage, after the grade, so it smears graded pixels rather
than raw radiance.

In supersonic or surge-front ground shots, pair it with a dust/shock cloud at the horizon. The
blur sells the velocity; the dust sells the *pressure*.

## 9. Saturation as an act signature, and lifted black

`saturation` is already a live uniform — key it to the phase of the event rather than setting it
once. The arc does a surprising amount of the emotional work:

| Phase | Saturation | Why |
|---|---|---|
| Ordinary life | ~0.21 above grey | believable, unremarkable |
| Peak destruction | ~0.34 | fire, plasma, heat haze — colour spikes with the energy |
| Ash, whiteout, vacuum | 0.02–0.04 | near-monochrome; the world has lost its colour |
| Aftermath | ~0.19 | recovers, but not all the way |

Run the same keyframe track over sky tint and ground albedo so the whole palette turns together
rather than the grade sliding over an unchanged scene.

**Never grade down to `#000`.** Flat black reads as a hole in the frame, not as darkness or
space. Floor it around `#101010` — a lifted black still has a surface. Keep the global vignette
near 12 % corner falloff (centre luma ~161, edge ~141); heavier and it fights the blur centre.
