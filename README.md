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

**This is a mobile game.** Phones in landscape are the target, desktop is incidental.

## Controls

|            | Touch                  | Keyboard              |
| ---------- | ---------------------- | --------------------- |
| **Jump**   | Tap/hold right half    | `Space` `↑` `W`       |
| **Slide**  | Hold left half         | `↓` `S` `Shift`       |
| New track  | Tap after finishing    | `R`                   |
| Tuner      | ⚙ button               | `T`                   |

Screen halves rather than gesture recognition: a swipe can't be recognised until it has
moved, and that delay is exactly the latency a platformer can't afford.

In landscape both **bottom corners are under a thumb** for the whole round, so nothing
lives there: every HUD readout is pinned to the top edge and the tuner button sits in the
top-right. Multi-touch is tracked per pointer, so slide and jump can be held together.

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

YAHIA is drawn in [`sprites.ts`](apps/client/src/render/sprites.ts) as ASCII pixel data —
dark curly hair, cream tee, pink shorts, navy sneakers, after the TUNISIA_HERO reference.

Authored at the game's own resolution rather than downscaled from reference art, and
re-emitted whenever `SCALE` changes.
Drawn in **right-facing profile**: an auto-runner only travels one way, and a front-facing
figure with legs splayed sideways reads as a star jump however you animate it.

Frames come out of [`tools/rig.py`](tools/rig.py), a small rasterizer — limbs are tapered
capsules, the head is two ellipses — followed by two automatic passes that do the work
hand-drawn ASCII could not:

- **Outline** on every silhouette edge.
- **Shading** that lights the top of each region and shadows its underside and right
  flank, with far-side limbs darkened so depth reads.

Flat fills with no outline were the single biggest gap against the reference art. Anatomy
was the second: the head is now about a sixth of body height instead of a third.

Eight frames: a 4-frame run cycle (**driven by stride distance, not time**, so footfalls
stay in step with speed), jump, fall, plus two the reference sheet has no equivalent for —
**slide**, the game's second verb, and **corpse**, lying flat because a body is a platform.

```bash
npm run spritesheet   # validates the data and renders a contact sheet PNG
npm run shot          # in-game screenshot at a phone's real pixel ratio
```

## Tuning

Press `T` (or tap ⚙) for live sliders over every constant in
[`tuning.ts`](apps/client/src/game/tuning.ts). The prototype exists to find numbers, and
numbers are found by dragging them while playing — not by editing a file and reloading.

## Architecture

```
apps/client/src/
  core/     rng.ts (seeded mulberry32) · loop.ts (fixed timestep) · input.ts
  game/     tuning · tiles · segments · level · physics · player · world
  render/   renderer · hud · palette
  ui/       tuner
tools/      playtest.mjs · bench.mjs · spritesheet.mjs · shot.mjs · rig.py
```

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

**Rendering is Canvas2D into a 1920×1080 backbuffer,** nearest-neighbour upscaled.
Deliberately not PixiJS yet: with placeholder art there is nothing for WebGL to
accelerate, and this removes all engine setup risk. Everything renderer-shaped is behind
one module, so swapping in Pixi when real atlases land is contained.

## Hosting

Client deploys to **Vercel** as a static bundle (`vercel.json` is set up; ~25 KB gzipped).

The multiplayer rooms will **not** live on Vercel. Its WebSocket support (public beta,
June 2026) pins connections to an instance with no cross-instance broadcast and a ~5
minute duration cap — twelve players in one room could land on different instances and
never see each other. Rooms belong on **Cloudflare Durable Objects**, where
`idFromName(roomCode)` maps a room code to exactly one stateful actor.

## Status

Verified by `npm run playtest` (15/15 checks, real browser, real build):

- Tracks generate, vary by seed, and are byte-identical for the same seed
- Auto-run, jump, slide, stand-up, respawn, checkpoints
- **Sliding a descent peaks at 900 vs 583 running it** — the momentum model pays
- Death leaves a body; bodies are solid platforms; martyr credit is recorded

## Not built yet

Networking, rooms, ghosts, scoring, real art, audio, the finish-line leaderboard.
See [DESIGN.md](DESIGN.md) for where it's going.
