import { px } from '../game/scale';
import manifest from './atlas.json';
import { RUNNER_SPANS, recolourSheet, type KitChoice } from './hero';
import atlasUrl from './yahia-atlas.png';
import maskUrl from './yahia-mask.png';

/**
 * YAHIA — the runner, sliced from the reference sprite sheets.
 *
 * These frames are the supplied art, not an approximation of it. Every frame is
 * cropped to one global bounding box shared across all four sheets, so the run
 * cycle keeps its bob, the jump keeps its arc, and every animation's feet land
 * on the same ground line. See tools/slice_sheets.py.
 *
 * Two poses the sheets do not contain:
 *   SLIDE  — the closest available is the deep crouch, so the slide hitbox was
 *            raised to meet the art rather than the art faked to meet the box.
 *   CORPSE — derived by rotating the idle pose onto its back. It is the only
 *            pose with a lying body's proportions.
 */

type FrameRect = readonly [number, number, number, number];

const FRAMES = manifest.frames as unknown as Record<string, FrameRect>;

export type SpriteName = keyof typeof manifest.frames & string;

export const RUN_CYCLE: readonly SpriteName[] = manifest.runCycle as unknown as SpriteName[];

/** The corpse's collision box is exactly its art, so its edges are unambiguous. */
export const CORPSE_SPRITE_W = FRAMES.corpse![2];
export const CORPSE_SPRITE_H = FRAMES.corpse![3];

/**
 * Sprites are drawn larger than their hitbox and anchored feet-to-feet, so hair
 * and swinging limbs overhang. That reads as generous rather than unfair — you
 * clip scenery with your hair without dying for it.
 */
const STAND_OFFSET = manifest.standOffset as unknown as readonly [number, number];
const SLIDE_OFFSET = manifest.slideOffset as unknown as readonly [number, number];

function offsetFor(name: SpriteName): readonly [number, number] {
  if (name === 'corpse') return [0, 0];
  if (name === 'slide') return SLIDE_OFFSET;
  return STAND_OFFSET;
}

let atlas: HTMLImageElement | null = null;
let kitMask: HTMLImageElement | null = null;
/**
 * What actually gets blitted: the atlas as shipped until a kit is chosen, then
 * a recoloured bake of it. Everything downstream draws from this one handle, so
 * changing kit is an assignment rather than a redraw path.
 */
let source: CanvasImageSource | null = null;

function loadImage(url: string, what: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${what} failed to load`));
    img.src = url;
  });
}

/** Resolve before the first frame renders; the loop must not start without art. */
export async function loadAtlas(): Promise<void> {
  [atlas, kitMask] = await Promise.all([
    loadImage(atlasUrl, 'atlas'),
    loadImage(maskUrl, 'kit mask'),
  ]);
  source = atlas;
}

/**
 * Repaint the runner in a player's kit.
 *
 * Baked once per change into an offscreen canvas rather than tinted per draw:
 * the runner is drawn every frame and a per-frame composite would be the most
 * expensive thing on screen for a result that never varies between frames.
 */
export function setKit(choice: KitChoice): void {
  if (atlas === null || kitMask === null) return;
  source = recolourSheet(atlas, kitMask, RUNNER_SPANS, choice);
}

export class SpriteBank {
  /** Draw with the sprite's offset applied to a hitbox-space position. */
  draw(ctx: CanvasRenderingContext2D, name: SpriteName, hitboxX: number, hitboxY: number): void {
    if (source === null) return;
    const rect = FRAMES[name];
    if (rect === undefined) return;
    const [sx, sy, sw, sh] = rect;
    const [ox, oy] = offsetFor(name);
    ctx.drawImage(source, sx, sy, sw, sh, Math.round(hitboxX + ox), Math.round(hitboxY + oy), sw, sh);
  }
}

/** Exposed for the atlas preview tool. */
export const ATLAS_MANIFEST = { ...manifest, imageUrl: atlasUrl };

/** Kept so the sprite tooling has something to assert against. */
export function validateSprites(): string[] {
  const problems: string[] = [];
  const needed: string[] = ['idle', 'jump', 'fall', 'slide', 'corpse', ...RUN_CYCLE];
  for (const key of needed) {
    if (FRAMES[key] === undefined) problems.push(`missing frame "${key}"`);
  }
  if (RUN_CYCLE.length < 4) problems.push(`run cycle has only ${RUN_CYCLE.length} frames`);
  if (manifest.scale !== px(1)) {
    problems.push(`atlas built for SCALE ${manifest.scale}, game runs at SCALE ${px(1)}`);
  }
  return problems;
}
