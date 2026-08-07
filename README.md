# YAHIA

**يحيى — "he lives."** A multiplayer pixel-art auto-runner where death builds the road.

Twelve phones, one track, ninety seconds. You cannot win by not dying.

---

## What this is right now

A **feel prototype**. It is single-player, has no networking, and exists to answer one
question before anything else gets built: *does slide-jumping feel good on a touchscreen?*

Everything in the multiplayer design rests on that. It is a day of work to find out and a
month of work to discover too late.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static bundle -> apps/client/dist
npm run playtest     # automated feel + physics harness (needs a preview server)
npm run bench        # mobile cost check: wasted pixels + throttled frame rate
```

**This is a mobile game.** Phones held **upright** are the target, desktop is incidental.
The viewport is **12 tiles wide on every device and as tall as the screen it lands on**, so
it reaches all four edges of any upright phone or tablet with no letterbox and no controls
taking up room. Landscape still plays, pillarboxed, and sees exactly the same 12 tiles.

## Controls

|            | Touch                  | Keyboard              |
| ---------- | ---------------------- | --------------------- |
| **Jump**   | Tap/hold right half    | `Space` `↑` `W`       |
| **Slide**  | Hold left half         | `↓` `S` `Shift`       |
| New track  | Tap after finishing    | `R`                   |
| Tuner      | ⚙ button               | `T`                   |

Screen halves rather than gesture recognition: a swipe can't be recognised until it has
moved, and that delay is exactly the latency a platformer can't afford.

The **bottom of the screen is under a thumb** for the whole round, so nothing readable
lives there: every HUD readout is pinned to the top edge and the tuner button sits in the
top-right. There are no on-screen buttons at all — the whole screen is the control, and a
labelled pad below the game was just a caption for something the screen already does, paid
for in the space the game could have used. Multi-touch is tracked per pointer, so slide and
jump can be held together.

## The three techniques

- **Jump** — variable height by hold duration. 100ms coyote time, 120ms input buffer.
  Both are non-negotiable on glass, where you don't control 60–100ms of input latency.
- **Slide** — halves your hitbox to pass under things. Bleeds speed on flat ground, so
  using it wrong costs you. **Accelerates on a descent** — this is the speed engine.
- **Slide-jump** — cancel a slide into a jump for a long, flat arc instead of a high one.
  Trades height for distance and carries bonus speed.

Speed is the resource. Base speed is what you drift back to; everything above it is
earned on slopes and spent on gaps. Going fast also *reduces* your look-ahead, so the
camera gives you less reaction time the better you're doing.

## The character

The runner is the **supplied reference art**, not an approximation of it.
[`tools/slice_sheets.py`](tools/slice_sheets.py) turns the four sprite sheets — idle, run,
jump, crouch — into a 19 KB atlas plus a manifest of frame rects and offsets.

```bash
npm run sprites      # re-slice the sheets into the atlas
npm run spritesheet  # render a labelled contact sheet of what shipped
```

Three things the slicer has to get right:

- **One global bounding box**, shared across all four sheets, rather than trimming each
  frame to its own content. Per-frame trimming would flatten the run's bob and the jump's
  arc into a figure that never leaves the floor.
- **A single ground line**, taken from the idle pose, so every animation's feet land in
  the same place and the character doesn't hop between states.
- **The real cycle length.** The run sheet holds *two* twelve-frame cycles; playing all 24
  would replay the stride twice per loop and read as a stutter. Measured by
  self-similarity, not eyeballed.

The cycle is driven by **stride distance, not elapsed time**, so footfalls stay in step
whether you're at base speed or pinned at the cap.

Two poses the sheets don't contain:

- **Slide** — the closest available is the deep crouch, so the *slide hitbox was raised to
  meet the art* (px(10) → px(14)) rather than the art faked to meet the box. It still
  clears the one-tile gap the ducker and tunnel segments depend on.
- **Corpse** — derived by rotating the idle pose onto its back. It's the only pose with a
  lying body's proportions; a curled crouch rotated is two-thirds as thick as the runner
  is tall and reads as a boulder.

## The kit

The character you meet before you play is an 8-frame turnaround, and the twelve
colours under him are how a room full of people tell each other apart.

```bash
npm run hero         # re-slice the turnaround and rebuild both garment masks
```

**Recolouring is a luminance remap, not a hue rotation.** The shirt in the source art
is cream — saturation 0.14 — and rotating the hue of something that desaturated
changes nothing you can see. What carries a garment is its shading, so that is what
survives: each pixel's luminance is normalised across the range the garment actually
occupies (measured at slice time, not assumed to be 0..1) and used to look up a ramp
built from the kit colour. The ramp runs from a darkened kit colour to a lightened one
rather than black to white, because a ramp that reaches true black turns every kit into
the same silhouette in the folds — which is the distinction being bought.

Which pixels are shirt and which are shorts is decided once, offline, by
[`slice_hero.py`](tools/slice_hero.py), where it can be looked at — the classifier
prints a debug sheet of exactly what it labelled. The clusters separate cleanly in HSV
(cream shirt at hue ~48, pink shorts at ~356, skin at ~20), and blobs smaller than 24px
are dropped, because the few lit hair pixels that land in a garment are invisible while
the shirt is cream and a bright dot on someone's forehead once it is blue.

The same classifier runs over the in-game atlas, so **the kit you pick is the kit you
race in**. A colour that stopped at the menu would be decoration rather than identity.
Both sheets bake once per change into an offscreen canvas — the runner is drawn every
frame, and a per-frame tint would be the most expensive thing on screen for a result
that never varies between frames.

The first pass ran both highlights half way to white and produced twelve sets of pastel
pyjamas: most garment pixels sit high in their luminance range, so a generous highlight
is where nearly all of them land.

## Tuning

Press `T` (or tap ⚙) for live sliders over every constant in
[`tuning.ts`](apps/client/src/game/tuning.ts). The prototype exists to find numbers, and
numbers are found by dragging them while playing — not by editing a file and reloading.

## Architecture

```
apps/client/src/
  core/     rng.ts (seeded mulberry32) · loop.ts (fixed timestep) · input.ts
  game/     tuning · tiles · segments · level · physics · player · world · view
  render/   renderer · hud · palette · sprites · tileart · worldart · hero · themes
  ui/       boot (loading + title + kit picker) · tuner
tools/      playtest · bench · spritesheet · shot
            slice_sheets.py · slice_tiles.py · slice_hero.py
```

**The world is a real tileset.** [`tools/slice_tiles.py`](tools/slice_tiles.py) slices the
supplied environment art, props and enemy characters into a 6 KB atlas. Two things it has
to work around: the tileset draws platforms as outlined *shells* over see-through
interiors, but YAHIA's ground is a solid mass — so interiors are composited onto an opaque
base sampled from the art itself. And it ships no slope tiles, so slopes are the surface
tile clipped to a triangle with the art's own two-tone crust drawn along the diagonal.

**Creatures are obstacles.** An `E` in a segment marks a spot where something stands; the
level picks which creature from the seed. They kill on contact and are **static** — at
these speeds a patrolling enemy is unreadable, and an obstacle you can't read isn't
difficulty, it's a coin flip. They deliberately break the one-hazard-colour rule, because a
character reads as dangerous by being a character; a pulsing mark underneath keeps them
inside the same visual language anyway.

**Biomes are a palette entry, not a tileset.** Tile and backdrop art is generated from a
[`Theme`](apps/client/src/render/themes.ts), so a new biome is a colour table plus two
style flags (`masonry`/`earth` ground, `towers`/`trees` backdrop). Two ship today —
`?theme=night` (default, the real tileset), `?theme=forest` and `?theme=ruins` — and the generator is deterministic, so the
same seed gives the same track in each.

Two rules survive every biome, because they are readability contracts rather than
decoration: the hazard colour is one saturated red used nowhere else, and backdrop colours
stay desaturated and far from the terrain in value so background can never be mistaken for
floor.

**Levels are stitched, not noise-generated.** A hand-authored library of challenge
segments in [`segments.ts`](apps/client/src/game/segments.ts), each declaring a
connection contract (ground row at its left and right edge). The generator only decides
the order, so completability is guaranteed by construction.

**Tracks are 4 bytes.** The seed builds the level; a client never receives map data.
Integer math only in generation — float drift across a Pixel, an iPhone and an old
Android is exactly the bug that surfaces as "one player's map has a wall in it."

**Physics is a height map, not polygon collision.** Flat ground, 45° slopes and corpses
all answer one question — *what is the surface Y under this point* — so the player only
ever deals with a single number. See [`physics.ts`](apps/client/src/game/physics.ts).

**Rendering is Canvas2D into a SCALE-derived backbuffer,** nearest-neighbour upscaled.
Still not PixiJS: 60fps unthrottled and 60fps at a 4× CPU throttle, and everything
renderer-shaped is behind one module if that stops being true.

Zooming in paid for itself twice: at 576×1249 the buffer is 0.72 Mpx, small enough that
every phone in `npm run bench` — including the budget 720p Android that once threw away 44%
of what it rendered — now *upscales* it. Fewer pixels, and none of them wasted. A 4× CPU
throttle costs nothing measurable any more.

**The canvas fills the stage; `object-fit` letterboxes the picture inside it.** The obvious
`width/height: auto` only ever *shrinks* a canvas to fit, so any screen wider than the
buffer — a tablet — got the buffer at intrinsic size marooned in the middle of a much
bigger screen.

**Anything static is baked once, never drawn per frame.** Tile textures, backdrop trees
and the sky all live in offscreen canvases. This is not premature — two full-screen
gradients rebuilt every frame cost 20.6fps against 60.3fps on a throttled phone profile,
and `npm run bench` reports cost per draw stage by elimination so the next one is
one command away.

**Nothing is drawn that something else will cover.** Earth below the crust is one rect per
column rather than tiles, and the sky is painted only down to the deepest earth line in
view. Together those are worth ~7fps at a 4× throttle on the portrait viewport — enough
that the taller window costs nothing against the landscape build it replaced.

## Hosting

Client deploys to **Vercel** as a static bundle (`vercel.json` is set up; ~36 KB JS + 25 KB of atlases).

The multiplayer rooms will **not** live on Vercel. Its WebSocket support (public beta,
June 2026) pins connections to an instance with no cross-instance broadcast and a ~5
minute duration cap — twelve players in one room could land on different instances and
never see each other. Rooms belong on **Cloudflare Durable Objects**, where
`idFromName(roomCode)` maps a room code to exactly one stateful actor.

## Status

Verified by `npm run playtest` (21/21 checks, real browser, real build):

- Tracks generate, vary by seed, and are byte-identical for the same seed
- Auto-run, jump, slide, stand-up, respawn, checkpoints
- **Sliding a descent peaks at 900 vs 583 running it** — the momentum model pays
- Death leaves a body; bodies are solid platforms; martyr credit is recorded
- Creatures are placed in the track and are lethal to touch
- Twelve kits are offered, repaint the hero, and are worn into the race

## Not built yet

Networking, rooms, ghosts, scoring, audio, the finish-line leaderboard.
See [DESIGN.md](DESIGN.md) for where it's going.
