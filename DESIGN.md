# YAHIA — design

**يحيى, "he lives."** Twelve phones, one track, ninety seconds.
You cannot win by not dying.

---

## The hook

Everyone races the same procedurally stitched course simultaneously. You die
constantly. **Every death leaves your body behind as a solid platform**, frozen exactly
where you fell — including mid-air.

So the leader unknowingly *paves the road* for everyone behind them. Every corpse is a
signpost saying "someone found this hard." The pack climbs your failures and closes the
gap. It's a rubber band that emerges from the fiction rather than being bolted on.

Bodies decay after ~15s so the level doesn't turn into soup, with the outline pulsing for
the final 3s — a platform must never vanish unannounced.

### The Martyr score

Count how many players stood on *your* body. Award points for it. The player in 11th who
kept dying at the hardest jump built the staircase everyone used, and they score for it.

In a 12-player party game, ten people are losing at any moment. Give them a second axis
to win on and they stay in the session. Two leaderboards: **Fastest** and **Most Trodden**.

---

## Locked decisions

| Decision | Choice |
| --- | --- |
| Players | 12+, each on their own phone |
| Platform | Mobile web — share a link, no download, no account |
| Controls | Auto-run + jump + slide |
| Round | Race to a finish line, ~75s, hard 90s cap |
| Collision | Living players are ghosts; **only corpses are solid** |
| Levels | Procedurally stitched from a hand-authored segment library |
| Art | Pixel art, 480×270 internal, sun-bleached ruins |

### Why non-solid players is the most important decision

It looks like a design choice. It's an architecture decision:

- **No player-player collision to synchronize** — the jitteriest part of multiplayer
  physics simply doesn't exist.
- **Rivals' positions become purely cosmetic.** A ghost 120ms stale changes nothing about
  your run, so you interpolate lazily and never reconcile.
- **The only gameplay-critical events are discrete** — "player N died at (x,y) at tick T"
  and "corpse N expired." Reliable, ordered, tiny, rare.
- **Therefore plain WebSockets over TCP suffice.** No WebRTC, no UDP, no rollback.
  Head-of-line blocking can only ever delay a ghost sprite.
- **Bandwidth is a rounding error**: 12 players × ~12 bytes × 20Hz ≈ **3 KB/s**.

Each client simulates its own player locally at full speed — zero input latency, which is
what makes a platformer feel good. The server only referees corpses, the clock, and
finish order.

---

## Constraints that shaped it

**1. Touch controls are the whole game.** Precision platforming on glass is bad. Every
phone platformer that works solved this by *removing inputs*, not by drawing a better
virtual d-pad. Hence auto-run: two verbs, three techniques.

**2. You can't show 12 players on a 6-inch screen.** So don't. Every player gets their own
camera; rivals are translucent ghosts drifting through frame. A shared world, twelve
private windows onto it. This is why a race works on phones and an arena brawl doesn't.

**3. Nobody can be eliminated.** Elimination in a 12-player session means eleven people
watching. Death has to be instant-recovery — which the corpse mechanic already gives you.

---

## Random maps

"Random" means **stitched, not noise-generated**. Noise produces platformers that are
infinite and reliably unfun. And a race has a constraint solo runners don't: the track
must be guaranteed completable, since a dead end kills twelve people's round at once.

Each segment declares a **connection contract**:

| Field | Purpose |
| --- | --- |
| `entry` / `exit` | Ground row at the left and right edge |
| `requires` | `jump` / `slide` / `slideJump` / `momentum` |
| `tier` | 1 (breather) to 5 (nasty) — drives the difficulty arc |

Generation is a walk that only joins pieces whose contracts line up. Completability holds
by construction because a human verified every piece.

Two rules the first implementation needed, learned by measuring generated tracks:

- **Avoid recent repeats.** Sampling by tier alone produced tracks with the same segment
  five times.
- **Force an elevation change every few segments.** Slopes are the only source of banked
  speed, and tier sampling left them out of entire tracks — which silently disabled the
  momentum model.

### The elegant thing random maps do to the corpse mechanic

Nobody has seen the track. The leader runs blind while everyone behind reads a map
annotated with bodies. **The leader is the scout, and pays for it.** Veterans can't
dominate through memorisation, which matters when twelve people of mixed skill are in a
room together.

---

## Visual language

**Opacity means solidity.** This is enforced absolutely — on a small screen with eleven
rivals on it, ambiguity about what you can stand on is fatal.

| Thing | Look | Solid? |
| --- | --- | --- |
| Living rival | 25% opacity, no outline | No |
| Corpse | Fully opaque, bright outline | **Yes** |
| Terrain | Solid silhouette | Yes |
| Hazard | One saturated colour, used nowhere else | Kills |

Backgrounds are desaturated **and** separated by a large value gap, never mid-tone —
background tiles reading as standable floor is the fastest way to make a pixel platformer
feel unfair.

This also solves the 12-colour palette problem for free: ghosts convey no identity, so
they're all one neutral tone. Only corpses need player colour.

**Theme: sun-bleached North African / Levantine ruins.** Ochre, terracotta, bone, lapis.
Underused in platformers, and the palette naturally provides the value separation the
readability rules demand. Biomes are then near-free variety — palette swap, tileset swap,
one signature hazard: *Sunken Cistern*, *The Kiln*, *Salt Flats*, *The Ossuary*.

---

## Session shape

- **Lobby** — room code + QR
- **5 tracks × ~75s**, hard 90s cap; anyone still running is ranked by distance so one
  player can't stall eleven
- **Checkpoints every ~10s.** Respawn 1.5s after death — restarting from the beginning
  would end your round
- **10s leaderboard between tracks**, Fastest and Most Trodden
- **~10 minutes per session**

Two things fall out for free:

- **Late join** — spectate the current track, auto-enter the next.
- **Disconnection is expressed as death.** Your phone rings, the tab freezes, you drop —
  your runner dies and leaves a body. No error state, no special-case code. The fiction
  absorbs the failure mode, and the reconnect handling you'd normally write is already
  in the design.

---

## Hosting

**Vercel** for the client — a pixel-art game is a static bundle plus texture atlases,
which is exactly what its CDN is best at. Preview deploy per branch for playtesters.

**Cloudflare Durable Objects** for the rooms. Vercel shipped native WebSockets (public
beta, June 2026), but connections pin to an instance with no cross-instance broadcast and
a ~5 minute duration cap — twelve players in one room could land on different instances
and never see each other, and a 10-minute session would be cut in half. A DO is exactly
the right primitive: `idFromName(roomCode)` maps a room code to one stateful actor, and
Hibernation means idle rooms cost nothing.

---

## Deliberately cut from v1

Level editor. Progression and unlocks. Matchmaking (room codes instead). Characters beyond
a recoloured blob. Chat. Anti-cheat beyond server-side velocity sanity checks.

---

## Open questions the prototype has to answer

1. **Does slide-jump feel good through ~100ms of touch latency?** Coyote time and jump
   buffering should carry it. This is the make-or-break question — everything above
   assumes yes.
2. **Does the staircase trivialise levels?** Twelve players dying at one jump could pile
   up enough bodies that the obstacle stops existing. Levers: shorter decay, tighter
   global cap, unstable bodies. Has to be felt, not reasoned.
3. **Visual noise.** Eleven ghosts plus dozens of corpses on a phone screen. The opacity
   rule helps; this could still read as soup.
4. **Is the slide too strong?** Measured: sliding a 6-tile descent hits the 300 speed cap
   while running it peaks at 194. That's the mechanic working — possibly working too
   well. One for the tuner sliders.
