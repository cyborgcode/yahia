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
```

## Controls

|            | Touch                  | Keyboard              |
| ---------- | ---------------------- | --------------------- |
| **Jump**   | Tap/hold right half    | `Space` `↑` `W`       |
| **Slide**  | Hold left half         | `↓` `S` `Shift`       |
| New track  | Tap after finishing    | `R`                   |
| Tuner      | ⚙ button               | `T`                   |

Screen halves rather than gesture recognition: a swipe can't be recognised until it has
moved, and that delay is exactly the latency a platformer can't afford.

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
tools/      playtest.mjs — automated feel harness
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

**Rendering is Canvas2D into a 480×270 backbuffer,** nearest-neighbour upscaled.
Deliberately not PixiJS yet: with placeholder art there is nothing for WebGL to
accelerate, and this removes all engine setup risk. Everything renderer-shaped is behind
one module, so swapping in Pixi when real atlases land is contained.

## Hosting

Client deploys to **Vercel** as a static bundle (`vercel.json` is set up; 8 KB gzipped).

The multiplayer rooms will **not** live on Vercel. Its WebSocket support (public beta,
June 2026) pins connections to an instance with no cross-instance broadcast and a ~5
minute duration cap — twelve players in one room could land on different instances and
never see each other. Rooms belong on **Cloudflare Durable Objects**, where
`idFromName(roomCode)` maps a room code to exactly one stateful actor.

## Status

Verified by `npm run playtest` (14/14 checks, real browser, real build):

- Tracks generate, vary by seed, and are byte-identical for the same seed
- Auto-run, jump, slide, stand-up, respawn, checkpoints
- **Sliding a descent peaks at 300 vs 194 running it** — the momentum model pays
- Death leaves a body; bodies are solid platforms; martyr credit is recorded

## Not built yet

Networking, rooms, ghosts, scoring, real art, audio, the finish-line leaderboard.
See [DESIGN.md](DESIGN.md) for where it's going.
