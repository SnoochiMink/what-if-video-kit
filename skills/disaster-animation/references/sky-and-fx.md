# Sky, atmosphere and effects

After the field itself, atmosphere is the biggest lever on whether a scene reads as real. Flat
lighting and a plain background make even good geometry look like a game asset; graded light,
depth fog and layered particles make boxes look like footage.

## Sky dome

A large back-side sphere with its depth write disabled, positioned at the camera each frame and
rendered first. Project to `gl_Position = p.xyww` so it always sits at the far plane.

Do not use a flat gradient. Real disaster skies are *directional* — black where the event is,
bright where it is not. That contrast is most of the drama.

```glsl
float facing = dot(normalize(d.xz), toEvent);
vec3 clear = mix(vec3(0.80,0.74,0.58), vec3(0.55,0.66,0.78), smoothstep(0.0,0.35,el));
vec3 storm = mix(vec3(0.20,0.22,0.22), vec3(0.11,0.12,0.13), smoothstep(0.0,0.5,el));
float slot  = smoothstep(-0.2,-0.85,facing) * (1.0 - smoothstep(0.02,0.16,el));
vec3 c = mix(storm, clear, slot * (1.0 - uDark*0.55));
c = mix(c, uFogColor, (1.0 - smoothstep(0.0,0.12,el)) * (1.0 - slot*0.7));   // haze the horizon
```

Tint for the disaster: green-black for tornadoes, orange-brown for wildfire and dust, red-grey
for volcanic ash, white-blue for an impact flash, deep violet for cosmic events.

## Fog is the depth cue

`FogExp2` across the whole scene, with colour and density keyframed to the event. This is what
separates foreground from background and gives a sense of scale. Raise density as the event
closes in; it also conveniently hides the far edge of your world.

**Custom shaders must match it.** Scene fog is applied in linear space before tone mapping, so
a custom shader that mixes toward the raw fog colour will visibly mismatch everything else.
Convert once per frame and pass the display-space colour to your own shaders:

```js
function toDisplay(c, exposure, out) {           // ACES filmic + sRGB, matching the renderer
  const f = v => { v = v * exposure / 0.6;
    v = (v*(v+0.0245786)-0.000090537)/(v*(0.983729*v+0.432951)+0.238081);
    v = Math.min(Math.max(v,0),1);
    return v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v,1/2.4)-0.055; };
  return out.setRGB(f(c.r), f(c.g), f(c.b));
}
```

## Lighting

Three lights, no more:

- **Hemisphere** for ambient, sky colour over ground colour. Intensity drops as the event darkens.
- **One directional** with the only shadow map. Keep the ortho box tight around the action
  (±110 m) and follow the camera target, or the shadows turn to mush.
- **An event light** — lightning flash, fire glow, impact flash, power-line arc. Short-lived,
  high intensity, repositioned per event.

Enable ACES filmic tone mapping and sRGB output. Linear output is the main reason amateur
three.js scenes look plasticky.

## Volumetric effects without raymarching

Full raymarching is too slow here. Nested transparent shells get you 90 % of the look at a tiny
fraction of the cost. For a funnel, column, plume or vortex:

- 3 concentric cylinder shells, alpha ~0.95 / 0.9 / 0.3, each with its own noise seed
- Radius driven by a profile function of height, perturbed by simplex noise
- Alpha modulated by `smoothstep` on the **facing ratio** — `abs(dot(normal, viewDir))` — so
  the silhouette is dense and the centre is translucent, which is what reads as volume
- Internal striations from `sin(angle·9 + height·55 + noise·5)`, scrolled downward over time

```glsl
float facing = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
float a = uA * dens * smoothstep(0.02, 0.38 + 0.2*n, facing) * mask;
```

Render shells after opaque geometry with `depthWrite: false` and explicit `renderOrder`.

## GPU particles

Anything over a few thousand particles should have its entire motion computed in the vertex
shader from a per-particle random seed and a time uniform. The CPU then only updates uniforms,
and 20–30 k particles cost essentially nothing.

```glsl
attribute vec4 aSeed;          // four stable randoms per particle
float life = fract(aSeed.x + uTime * 0.05 * (0.5 + aSeed.z));
float y = pow(life, 1.6) * uH * 0.85;
float R = profileR(y / uH) * (0.85 + 0.65 * aSeed.y);
float ang = aSeed.w * 6.2832 + uPhase * (uRc / max(R, uRc*0.6));
vec2 ax = axisAt(y);                                   // same axis as the physics
p = vec3(ax.x + cos(ang)*R, y, ax.y - sin(ang)*R);
alpha = smoothstep(0.0,0.05,life) * (1.0 - smoothstep(0.7,1.0,life));
```

Size must shrink with distance the way real perspective does:

```js
const ph = drawBufferHeight / (2 * Math.tan(degToRad(camera.fov) / 2));
uniforms.uScale.value = ph;                 // gl_PointSize = size * uScale / -mvPosition.z
```

Layer at least three systems for any large effect — fine fast particles near the core, large
slow puffs around it, and sparse dark specks for debris. A single system always reads as a
single system.

For sprites, build the texture procedurally: several offset radial gradients in a canvas, which
gives a lumpy cloud rather than an obvious soft circle. Rotate each in the fragment shader from
its seed so they do not all align.

## Water

A displaced plane plus a drag field. Height comes from a few summed directional waves plus
noise; for a tsunami add a travelling front term. Shade with a fresnel mix between a deep
colour and a sky reflection, plus foam where the gradient is steep or the water meets geometry.

The three details that sell water: foam at the leading edge, visible debris carried *in* the
flow, and objects that bob and rotate rather than slide. See `disasters/tsunami.md`.

## Fire and smoke

Fire is additive, smoke is not — that is the main thing. Flames: a few hundred upward sprites
with a yellow→orange→dark ramp over life, additive blending, no depth write. Smoke: large slow
dark sprites with normal blending, rising and expanding, drifting with the wind field.

Fire should light the scene. One flickering point light at the fire's centroid, intensity
driven by noise, does more for believability than any amount of sprite work.

Embers are the signature of wildfire: tiny bright additive points carried by the wind field,
lasting much longer than the flames, drifting far downwind.

## Lightning

Build the bolt as a subdivided polyline with midpoint displacement, recursively branching twice.
Expand to camera-facing quads, plus a second wider pass with additive blending for glow.

Real lightning restrikes. Model the flash as 2–3 decaying pulses over ~0.4 s rather than one,
and drive both a scene-wide flash uniform and a directional light from the same value. Delay
the thunder by `distance / 343` seconds.

## Rain

Line segments in a box that follows the camera, with positions wrapped modulo the box so they
never run out. Stretch each segment along the velocity vector, and drive that velocity from the
actual wind at the camera so rain goes sideways in a storm.

Keep rain alpha low — around 0.2. Rain that reads clearly in a still is far too strong in
motion.

## Screen sharpness

Three things make these videos look soft, and all three are easy to get wrong:

**Render resolution.** On a 1× display `devicePixelRatio` is 1 and you get no supersampling at
all. Force it up and let the browser downsample:

```js
const pr = Math.min(Math.max(window.devicePixelRatio || 1, 1.75), 2160 / height, 2.5);
```

**Film grain.** Nice at 3–4 % opacity from a reasonably sized canvas. At 7 % from a 180×320
canvas stretched over the frame it is just blur. Use low-contrast noise: `128 + (rand−0.5)·150`.

**Vignette.** Keep it under ~40 % and start it past 60 % of the radius. Heavy vignettes eat the
corners of a vertical frame where there is already little room.
