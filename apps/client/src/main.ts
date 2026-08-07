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
import { createTuner } from './ui/tuner';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const stage = document.querySelector<HTMLElement>('#stage');
if (canvas === null || stage === null) throw new Error('missing stage');

// Up before the awaits, so there is something to look at during them rather
// than a black screen of unknown length.
const boot = createBoot();

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
 * The portrait thumb pad lights up while a half is held. The pad is a label for
 * a screen half, not a button — input is still read from the whole stage — so
 * its lit state has to be driven from the input layer rather than CSS :active,
 * which would drop the moment a thumb slid off the element it started on.
 */
const padSlide = document.querySelector<HTMLElement>('#pad-slide');
const padJump = document.querySelector<HTMLElement>('#pad-jump');
function syncPad(): void {
  padSlide?.classList.toggle('on', input.slideHeld);
  padJump?.classList.toggle('on', input.jumpHeld);
}

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
(window as unknown as { yahiaSprites: unknown }).yahiaSprites = {
  manifest: ATLAS_MANIFEST,
  corpse: [CORPSE_SPRITE_W, CORPSE_SPRITE_H],
  validate: validateSprites,
};

function newTrack(): void {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  history.replaceState(null, '', `#seed=${seed}`);
  world.reset(seed);
  showHints = true;
}

const tuner = createTuner(newTrack);

boot.ready((kit) => {
  setKit(kit);
  running = true;
});

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
    if (running) world.step(dt, input);
  },
  () => {
    renderer.draw(world);
    drawHud(renderer.context, world, showHints);
    syncPad();
  },
);
