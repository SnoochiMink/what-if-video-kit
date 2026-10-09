# Real events: reconstructing something that happened

A "what if" can invent everything. A reconstruction of a real disaster cannot, and the
differences change how the whole piece is built. Read this whenever the user names a real
event, uploads research about one, or asks for a "first-hand account".

## Confirm the subject before building it

A real event offers many stories — one town's seawall, one school, one nuclear plant, the
event as a whole. Picking a narrow, clever sub-story without confirming it is the most
expensive mistake available: a full build of the Taro seawall story was rejected with "it
doesn't even cover the incident I wanted". If the user says "this tsunami", ask (once, with
options) whether they mean the event as a whole or a specific place or story within it.
Default to the event as a whole, seen through one well-documented place.

Likewise, "first-hand account" is ambiguous: a first-person narrator, real survivor quotes,
or a POV camera. They are completely different builds. Ask.

## Source a minute-by-minute record first

Before any scene code, find the **official local disaster record** for the place — Japanese
municipalities publish detailed English editions (e.g. "Records of Miyako City" via the Iwate
archive). These give what a film actually needs:

- clock times for each phase (quake, warning, drawback, arrival, peak, upgrades);
- what was seen at specific landmarks ("the Hei River with the bottom visible", "a fire engine
  ran along the dike calling for evacuation", "horns of cars caught by waves kept sounding");
- local heights, deaths, missing, buildings destroyed, people under evacuation orders.

PDFs from these archives often fetch as binary. Extract text with `pypdf` into a scratch file
(run Python **without** `-I` so a user-installed `pypdf` is importable) and grep it for clock
times, metres, and landmark names. The documented observations become the shot list.

Cross-check national figures against the current official source (Japan's National Police
Agency publishes updated dead/missing totals each March) and date them on screen.

## Captions state facts; readouts are exact

- Every caption is a documented fact, at the minute it happened: "3:18 PM — the Hei River
  drains. Its bed is exposed." Not mood ("It does not break. It just keeps coming."). Moody
  fragments were a specific rejection reason.
- Warning readouts follow the issuing agency's actual sequence. JMA's forecast for Iwate went
  3 m (14:49) → 6 m (15:14) → over 10 m (15:30) — a cut that showed 10 m at 15:14 was simply
  wrong, and the true sequence (raised to 10 m four minutes *after* Miyako's largest wave) is a
  stronger beat than the invented one.
- Show only documented numbers. A live "flow depth" readout for a reconstructed street is an
  invented number dressed as data; prefer event-level figures that are on record.
- The clock shows documented minutes and **holds** between them. Inventing a precise minute
  for an undocumented phase is inventing evidence.
- Label it: a small persistent "3D RECONSTRUCTION" tag, and "a reconstruction, not footage" on
  the end card with the sources.

## Time compression must move people too

A 61-second film covering 40 minutes skips time. When it does, **every actor whose fate
depends on elapsed time has to be advanced across the skip**. Otherwise evacuees who started
walking at 14:49 are still a few hundred metres from the river at 15:25, and the flood kills
the entire cast — twice, in this project, on a real event where the town lost about 1% of its
people. That is not drama, it is a false statement about a real disaster.

Rule: at each time-skip card, move anyone who was already evacuating to safety (off screen),
and check the surviving count in `simStats()` against the real proportion before every render
review. Keep any on-screen loss representative of the documented pattern (in Tōhoku, the
elderly and those who stayed to watch), and never show a death — people are last seen, or
simply no longer in frame.

The same applies to geography: if the high ground is where survivors went, put it at its real
distance. On a ria coast that is close, which is exactly why most people lived.

## The POV camera

A first-person rig, all driven from two keyframe lists — `PATH [t, x, z, eyeHeight, mode]`
and `LOOK [t, target]` (a target may be a function of t):

- eye height 1.62 m standing, ~1.0 m crouching; `mode` = stand / walk / run / crouch / window;
- head-bob from **actual ground speed**, so it matches the pace: ~3.5 cm walking, ~7.5 cm
  running, with lateral sway and a slight head-down pitch when running;
- breathing (~7 mm at 1.7 Hz) when still; smooth-noise handheld drift that grows with fear;
- earthquake: rotational shake plus the field's ground displacement applied to the position;
- look-backs while running are just extra `LOOK` keys pointing behind;
- a window: aluminium mullions parented to the camera and lit by the scene (not a CSS
  overlay), placed so they only just enter the frame edges — at 9:16 that is ~0.1 of the
  near-plane width;
- transitions (time skips, going indoors) as exposure fades in post, under a caption card.

Anything the camera tracks must be a **pure function of time** (`firePos(t)`), shared by the
camera and the mesh. The camera updates before the mesh is written each frame, and a
fast-forwarded still never writes it at all, so a tracked object read from its mesh position
points the camera at the world origin.
