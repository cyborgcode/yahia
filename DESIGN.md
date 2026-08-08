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
| Orientation | Portrait — held upright, game edge to edge, no on-screen buttons |
| Art | Reference sprite sheets, 480×(device) internal at SCALE 3 |

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

**2. You can't show 12 players on a 6-inch phone.** So don't. Every player gets their own
camera; rivals are translucent ghosts drifting through frame. A shared world, twelve
private windows onto it. This is why a race works on phones and an arena brawl doesn't.

**3. Thumbs cover the bottom of the screen.** Nothing readable may live there — a settings
button in a thumb zone eats jump inputs, and a stats readout there is simply never seen.
Every persistent readout is pinned to the top edge instead.

But nothing tappable needs to live there either, because **the whole screen is already the
control**. A labelled pad below the game was a caption for something the screen does
anyway, and it cost the game a third of the display to say it. The screen halves teach
themselves in one round; the hint overlay covers the first.

**4. Nobody can be eliminated.** Elimination in a 12-player session means eleven people
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
- **Teach before test.** A technique may only be demanded above tier 2 once it has already
  turned up somewhere gentler. Measured across 300 seeds, the slide-jump was introduced
  cold *every single time*, because nothing below tier 3 used it — so the rule's real work
  was exposing a missing piece rather than reordering existing ones.
- **Challenge is separated by rest.** At most two hard segments before a breather. Tracks
  previously ran ten deep.

These are ordinary platformer pacing rules; the point is that a generator will break every
one of them silently unless the rule is written down and measured.

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

Backgrounds are separated by a large value gap, never mid-tone — background reading as
standable floor is the fastest way to make a pixel platformer feel unfair. The *direction*
of that gap is not fixed: the night biome puts a light teal sky behind dark terrain and is
just as readable as a dark sky behind lit terrain. What matters is the size of the gap.

A corollary learned by breaking it: **HUD contrast cannot depend on the world behind it.**
The segment name sat bare on the sky, which was fine while every biome had a dark one and
vanished the moment one shipped a light sky. Every readout is boxed now.

This also solves the 12-colour palette problem for free: ghosts convey no identity, so
they're all one neutral tone. Only corpses need player colour.

**Identity is a kit, picked before the round.** Twelve outfits, each a shirt colour over a
shorts colour, chosen whole rather than assembled — no two share a dominant colour, because
the job is telling twelve people apart across a room.

It is chosen on the title screen because that is the one moment nobody is racing — and
because a player who has picked a colour has already been asked, gently, to care which
body on the staircase is theirs.

The technique matters more than it sounds: the source shirt is cream, and a hue rotation
of something that desaturated does nothing. Kits replace the colour and keep only the
shading, so a garment stays a garment. See the README for how.

Resolution is a single constant, `SCALE`. The **field of view is a fixed tile count
ACROSS — 10 — at every scale, on every device, in both orientations**. No player may ever
see further ahead than another, which in a race is a fairness requirement rather than a
preference.

**The height is the device's.** A fixed buffer can only ever match one screen shape, and
upright phones run from about 1:1.78 to 1:2.22 — a buffer cut for the tall end puts bars
down both sides of the short end. So the width stays a fixed tile count, which is the half
that has to be fair, and the height follows whatever screen it lands on, measured against
the safe box rather than the raw window so the notch doesn't put the bars back.

That does mean vertical field of view varies between devices, and that is the right thing
to give up. This is a horizontal race: what one player can see of the track *ahead* is a
fairness question, and how much sky sits above them is not.

The count came down 30 → 20 → 14 → 12 → 10 as the game moved to portrait and then chased a
readable character. At 390 CSS pixels of phone, 20 tiles is a 19px tile and a runner 14px
wide — someone you can lose track of on the thing you are meant to be watching. 10 is a
39px tile and a runner of 29.

**Look-ahead is what that costs, and it cannot be conjured back.** The most track that can
ever be ahead of the runner is the viewport minus where he stands in it. 30 tiles gave
1.37s of warning at top speed; 10 gives 0.46s, against roughly 0.35s of touch latency and
reaction. Speed eating your warning is the deal the speed model makes on purpose — but it
is why the tile count cannot keep falling, and the next step down should be felt on a real
phone before it is taken.

An earlier version of this document claimed those figures were far healthier. They weren't:
the sums added an absolute forward camera push to the viewport width, as if the push
created track rather than moving the runner across the same track. It did move him — off
the left edge. Which is the next paragraph.

**Where the runner sits is two fractions of the viewport, never a pixel offset.** He rests
at 0.26 across and slides to 0.14 flat out. It used to be one anchor plus an absolute push
in pixels, and that push had no idea how wide the viewport was: every zoom made it a larger
share of the screen, until at 12 tiles it put him 184px *past* the left edge at top speed —
invisible exactly when you most need to see him, and shipped that way. As fractions, he
cannot leave the screen however far the view zooms, and the harness now asserts it.

The runner also sits **low** in the frame, not centred. A viewport that fills a phone is
~22 tiles tall against a playable band about half that, and centring him spent the whole
bottom of the screen on earth nobody can reach. Everything worth seeing is above the ground
line: jumps, hazards, and the corpse staircase, which climbs.

That only works if the camera has room to move. At 40 grid rows it had ten, and the framing
was decided by the clamp rather than the camera; the grid is 60 rows now. The extra rows
cost nothing — everything above the track is clipped sky and everything below is flooded
flat.

`SCALE = 3` was chosen by measuring phones, not by taste, and the zoom vindicated it twice
over: at 480×1041 the buffer is 0.50 Mpx, small enough that **every** phone in the bench
upscales it — including the budget 720p Android that once threw away 44% of what it had
just rendered — and a 4× CPU throttle no longer costs anything measurable.

**Anything below the crust is flooded, not tiled.** Three tiled rows of earth and then one
rect per column to the bottom of the view. Tiling to the grid floor looks identical and
cost 11fps on a throttled phone at a tall viewport. The sky is clipped the same way —
painted only down to the deepest earth line in view, since nothing above it can show
through, except down an open chasm where it correctly runs to the floor.

**Biomes are near-free variety** — palette swap, tileset swap, one signature hazard — and
that is now literally true: tile and backdrop art is generated from a `Theme` record, so
adding one is a colour table plus two style flags. Two exist: **forest** (grass-capped
earth, canopy backdrop) and **ruins** (sun-bleached North African stone, ochre and
terracotta, battlement skyline). Still to come: *Sunken Cistern*, *The Kiln*, *Salt Flats*,
*The Ossuary*.

Whatever the biome, the hazard colour never moves. It is a contract with the player, not a
mood.

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

**Cloudflare Durable Objects** for the rooms — now built, in `apps/server/`, as one object
per room code via `idFromName`. Vercel shipped native WebSockets (public
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
