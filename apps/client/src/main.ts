import { Input } from './core/input';
import { startLoop } from './core/loop';
import { seedFromString } from './core/rng';
import { World } from './game/world';
import { drawHud } from './render/hud';
import { Renderer } from './render/renderer';
import { SCALE } from './game/scale';
import {
  ATLAS_MANIFEST,
  CORPSE_SPRITE_H,
  CORPSE_SPRITE_W,
  loadAtlas,
  setKit,
  validateSprites,
} from './render/sprites';
import { loadWorldAtlas } from './render/worldart';
import { loadHero } from './render/hero';
import { createBoot } from './ui/boot';
import { RoomClient } from './net/room';
import { createTuner } from './ui/tuner';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const stage = document.querySelector<HTMLElement>('#stage');
if (canvas === null || stage === null) throw new Error('missing stage');

// Up before the awaits, so there is something to look at during them rather
// than a black screen of unknown length.
// The room, if one is configured. With no server this is inert and the game is
// exactly the single-player prototype it has always been.
const room = new RoomClient();
const boot = createBoot(room);

// Atlases must decode BEFORE the renderer is constructed, not merely before the
// loop starts: the tile bank bakes its canvases from the atlas image in the
// constructor, and would otherwise bake a set of blank tiles.
await Promise.all([loadAtlas(), loadWorldAtlas(), loadHero()]);

// Apply the remembered kit before the first frame, so the runner visible behind
// the title screen is already wearing it rather than changing colour on PLAY.
setKit(boot.kit());

const renderer = new Renderer(canvas);
const input = new Input();
input.attach(stage);

/**
 * Seeds come from the URL so a track is shareable — the same 4 bytes the
 * server will broadcast to twelve phones later.
 */
function seedFromUrl(): number {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('seed');
  if (fromHash !== null && fromHash.length > 0) return seedFromString(fromHash);
  return (Math.random() * 0xffffffff) >>> 0;
}

const world = new World(seedFromUrl());
let showHints = true;
/**
 * The world renders from the first frame — the title sits over a live track —
 * but it does not advance until PLAY. Stepping behind the menu would spend the
 * clock, and the first thing a player sees of their run would be a time that
 * already started without them.
 */
let running = false;

// Exposed so feel can be measured, not just guessed at — the automated harness
// drives inputs and reads speed/height back out of here.
(window as unknown as { yahia: World; yahiaInput: Input }).yahia = world;
(window as unknown as { yahia: World; yahiaInput: Input }).yahiaInput = input;
(window as unknown as { yahiaScale: number }).yahiaScale = SCALE;
(window as unknown as { yahiaRenderer: Renderer }).yahiaRenderer = renderer;
(window as unknown as { yahiaRoom: RoomClient }).yahiaRoom = room;
(window as unknown as { yahiaSprites: unknown }).yahiaSprites = {
  manifest: ATLAS_MANIFEST,
  corpse: [CORPSE_SPRITE_W, CORPSE_SPRITE_H],
  validate: validateSprites,
};

function newTrack(): void {
  // Only solo. In a room the track is the room's, and picking your own would
  // put you on a different course from everyone you are racing.
  if (room.enabled) return;
  const seed = (Math.random() * 0xffffffff) >>> 0;
  history.replaceState(null, '', `#seed=${seed}`);
  world.reset(seed);
  showHints = true;
  reportedFinish = false;
  reportedDeaths = 0;
}

const tuner = createTuner(newTrack);

boot.ready((kit) => {
  setKit(kit);
  running = true;
});

// --- the race, when there is more than one of you ---------------------------
room.on({
  // Everybody rebuilds the same track from the same four bytes. No map data is
  // ever sent, which is the entire reason the seed is the unit of a race.
  onStart: (seed) => {
    world.reset(seed);
    // Read at the gun, not at boot: the name and the outfit can both change
    // right up until READY.
    world.me = { name: boot.name(), kit: boot.kitIndex() };
    showHints = false;
    running = true;
    announced = 0;
    reportedFinish = false;
    reportedDeaths = 0;
  },
  // A rival's body is solid ground to you, exactly like your own.
  onCorpse: (x, y) => world.addForeignCorpse(x, y),
  onOver: (finishers) => {
    running = false;
    boot.reopen(finishers);
  },
});

let reportedFinish = false;
let reportedDeaths = 0;
/** How much of the finish order has already been announced on screen. */
let announced = 0;

// Restarting: any tap once you've finished, or R at any time.
stage.addEventListener('pointerdown', () => {
  showHints = false;
  if (world.finishedMs !== null) newTrack();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') newTrack();
  else if (e.code === 'KeyT') tuner.toggle();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) showHints = false;
});

/** Phones sleep mid-race otherwise. Best-effort; unsupported browsers no-op. */
async function keepAwake(): Promise<void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request(kind: 'screen'): Promise<unknown> };
  };
  try {
    await nav.wakeLock?.request('screen');
  } catch {
    /* denied or unsupported — not worth surfacing */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void keepAwake();
});
void keepAwake();

startLoop(
  (dt) => {
    if (!running) return;
    world.step(dt, input);

    if (room.enabled) {
      // Re-read rather than hold: the net layer replaces this array on every
      // packet, so a reference taken once at the start goes permanently stale.
      world.ghosts = room.ghosts;
      world.race = { home: room.home, ends: room.ends, myPlace: room.myPlace };
      // Announce arrivals, but not your own — finishing puts a whole screen in
      // front of you already, and it does not need a caption.
      while (announced < room.finishers.length) {
        const f = room.finishers[announced]!;
        announced += 1;
        if (f.id === room.selfId) continue;
        const left = Math.max(0, room.ends - announced);
        world.notice = {
          text: left > 0 ? `${f.name} IS HOME — ${left} LEFT` : `${f.name} IS HOME`,
          leftMs: 2600,
        };
      }
      const p = world.player;
      const now = performance.now();
      room.position(p.x, p.y, p.sliding ? 'slide' : p.grounded ? 'run' : 'air', now);
      // Counted, not observed. Watching for `alive` to be false between frames
      // misses a death whose respawn timer had already run down, because the
      // runner is back on his feet before the next check.
      if (world.deaths > reportedDeaths) {
        reportedDeaths = world.deaths;
        const body = world.lastOwnCorpse;
        if (body !== null) room.died(body.x, body.y);
      }
      if (world.finishedMs !== null && !reportedFinish) {
        reportedFinish = true;
        room.finished();
      }
    }
  },
  () => {
    renderer.draw(world);
    drawHud(renderer.context, world, showHints);
  },
);
