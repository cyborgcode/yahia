# YAHIA

**يحيى — "he lives."** A multiplayer pixel-art auto-runner where death builds the road.

Twelve phones, one track, ninety seconds. You cannot win by not dying.

---

## What this is right now

A playable race. Share a link, pick an outfit, type a name, everyone hits READY, and the
round ends on the third runner home.

The client is deployed. **The room server is not** — it needs somewhere to live that isn't
Vercel, whose WebSockets pin to an instance with no cross-instance broadcast and a ~5
minute cap. `apps/server/` is a Cloudflare Durable Object ready to `wrangler deploy`; until
it is deployed and `VITE_ROOM_URL` is set, the game runs as the single-player prototype it
started as.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static bundle -> apps/client/dist
npm run playtest     # automated feel + physics harness (needs a preview server)
npm run bench        # mobile cost check: wasted pixels + throttled frame rate
npm run room         # the room server, for local multiplayer
npm run multitest    # three real browsers through a whole race
```

**This is a mobile game.** Phones held **upright** are the target, desktop is incidental.
The viewport is **10 tiles wide on every device and as tall as the screen it lands on**, so
it reaches all four edges of any upright phone or tablet with no letterbox and no controls
taking up room. Landscape still plays, pillarboxed, and sees exactly the same 10 tiles.

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
camera gives you less reaction time the better you're doing — 0.79s of warning at base
speed, 0.46s flat out, against roughly 0.35s of touch latency plus reaction.

**Both ends of that are fractions of the viewport, never pixels.** They used to be an
anchor plus an absolute forward push, and that push didn't know how wide the screen was:
every zoom made it a bigger share of it, until at 10 tiles it would have put the runner
184px past the left edge at top speed — invisible exactly when you most need to see him.
`npm run playtest` now asserts he is on screen at every speed, because nothing did before.

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

The character you meet before you play is an 8-frame turnaround, and the colours
under him are how a room full of people tell each other apart.

```bash
npm run hero         # re-slice the turnaround and rebuild both garment masks
```

**A kit is an outfit, picked whole.** Twelve combinations of shirt and shorts colour, one
tap each, and the swatch is split — shirt above the diagonal, shorts below — so the chip is
a picture of the thing it selects rather than a label for it.

Two independent pickers were tried and dropped. 144 combinations sounds generous until you
notice most of them are ugly and that choosing costs two decisions before a game that lasts
ninety seconds. Twelve chosen outfits are one decision and all of them look deliberate.
They are picked so no two share a dominant colour, because the job is telling twelve people
apart across a room: "the green one" has to be unambiguous.

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

**The ground is dressed, and only where it is safe to.** Two surface variants picked by
world position so the ground line stops repeating; tufts, stones and fencing scattered
along it from the column index, so the same seed grows the same scenery on every phone.

Scenery goes **only on flat solid tops** — never a slope, a spike or a breakable, where a
decoration would sit at an angle or soften something about to kill you. And only low, flat,
unmistakably decorative things: the tileset also has crates, benches and a ladder, and none
of them are used, because a crate the runner passes straight through is a lie about what
terrain does. The hedge was tried as a backdrop layer and taken out for the same reason —
it is a closed ring of foliage rather than a silhouette, so at the ground line it read as a
bush standing *on* the platform.

**Bedrock is generated, not sliced.** The tileset's interior tile is genuinely blank — it
was drawn to sit behind a platform shell a few tiles tall, not to be the bottom third of
the screen, which is what it became when the view zoomed in. Patterning it changed nothing,
because there was nothing in it to repeat. It is grain and faint strata over the art's own
base tone, deliberately low contrast: this is the one region that must never suggest an
edge you could stand on. The tile and the flood fill share one bake, or the boundary
between them shows as a hard seam.

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

**Levels follow the standard platformer pacing rules, and are checked against them.** Both
were being broken in every single track before they were written down, which is why they
are measured over 200 seeds rather than eyeballed on one:

- **Teach before test.** A technique gets a safe first meeting before it is demanded in
  anger. `slideJump` used to be introduced at tier 3 or worse *100% of the time*, because
  no segment below tier 3 used it at all — turning the rule on is what exposed the gap in
  the library and forced a gentle teacher (`low-bar`) to be authored rather than the rule
  weakened to fit.
- **Challenge is separated by rest.** Tracks ran up to ten hard segments back to back;
  only tier 4+ forced a breather, so long tier-3 chains went unbroken. Two now, then rest.

One rule from the reading was checked and *not* adopted: giving each segment clear ground
before its first hazard. It sounds right and does nothing here, because look-ahead is
uniform — the camera shows a fixed distance, so a hazard is visible the same ~0.43s ahead
wherever it happens to sit inside a segment.

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

Zooming in paid for itself twice: at 480×1041 the buffer is 0.50 Mpx, small enough that
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

## Multiplayer

Share the link. Everyone who opens it lands in the same room, picks an outfit, types a
name, and hits READY; the race starts when that is true of everybody, and **ends on the
third runner home** rather than the last, so nobody spends the end of a round watching.

```bash
npm run room        # the room server, ws://127.0.0.1:8787
npm run multitest   # three real browsers through the whole flow
```

**The server referees three things and no more:** who is in the room, when the race
starts, and who finished. Physics, the track and collision are all local. The track is
*four bytes* — every client rebuilds it from the seed, so no map data is ever sent.

That is only possible because living players are ghosts. A rival 120ms stale changes
nothing about your run, so positions are cosmetic and are never reconciled. The one thing
that must arrive reliably and in order is a **death**, because a body is solid ground to
everyone else — a platform only some players can see would be a different game for each of
them. Deaths are counted rather than observed, since watching for `alive` to go false
between frames misses a death whose respawn timer had already run down.

`apps/server/room.mjs` is the whole rulebook and imports nothing, so the same file runs
inside a Durable Object and inside the Node dev server. Two hosts, one set of rules.

## Hosting

Client deploys to **Vercel** as a static bundle (`vercel.json` is set up; ~36 KB JS + 25 KB of atlases).

The multiplayer rooms will **not** live on Vercel. Its WebSocket support (public beta,
June 2026) pins connections to an instance with no cross-instance broadcast and a ~5
minute duration cap — twelve players in one room could land on different instances and
never see each other. Rooms belong on **Cloudflare Durable Objects**, where
`idFromName(roomCode)` maps a room code to exactly one stateful actor.

### Turning multiplayer on

Two commands and one environment variable, against your own Cloudflare account:

```bash
npx wrangler deploy --config apps/server/wrangler.toml   # prints wss://yahia-rooms.<you>.workers.dev
```

Then set `VITE_ROOM_URL` to that origin in the Vercel project's environment variables and
redeploy. It is a **build-time** value — the client reads it through `import.meta.env`, so
setting it without a rebuild changes nothing. Until it is set, `RoomClient.enabled` is
false, the socket is never opened, and the game is the single-player prototype.

The migration is declared `new_sqlite_classes`, which is the only Durable Object backing
the Workers Free plan will deploy. The object stores nothing but an alarm, so that costs
nothing.

If you would rather not use Cloudflare: `apps/server/room.mjs` imports nothing and is
already driven by plain `ws` in `tools/dev-room.mjs`, so any always-on Node host (Fly,
Railway, Render) runs the same rulebook. What it cannot be is serverless — a room is a
stateful actor that has to outlive a request.

## Status

Verified by `npm run playtest` (25/25 checks, real browser, real build):

- Tracks generate, vary by seed, and are byte-identical for the same seed
- Auto-run, jump, slide, stand-up, respawn, checkpoints
- **Sliding a descent peaks at 900 vs 583 running it** — the momentum model pays
- Death leaves a body; bodies are solid platforms; martyr credit is recorded
- Creatures are placed in the track and are lethal to touch
- Twelve outfits are offered, repaint the hero, and both garments are worn into the race
- Every technique is taught before it is tested, and challenge is broken by rest (200 seeds)

## Not built yet

Networking, rooms, ghosts, scoring, audio, the finish-line leaderboard.
See [DESIGN.md](DESIGN.md) for where it's going.
