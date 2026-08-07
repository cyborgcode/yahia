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
  validateSprites,
} from './render/sprites';
import { loadWorldAtlas } from './render/worldart';
import { createTuner } from './ui/tuner';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const stage = document.querySelector<HTMLElement>('#stage');
if (canvas === null || stage === null) throw new Error('missing stage');

// Atlases must decode BEFORE the renderer is constructed, not merely before the
// loop starts: the tile bank bakes its canvases from the atlas image in the
// constructor, and would otherwise bake a set of blank tiles.
await Promise.all([loadAtlas(), loadWorldAtlas()]);

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
  (dt) => world.step(dt, input),
  () => {
    renderer.draw(world);
    drawHud(renderer.context, world, showHints);
  },
);
