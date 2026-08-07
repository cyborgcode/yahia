import { px } from '../game/scale';
import { TILE } from '../game/tiles';
import manifest from './world-atlas.json';
import atlasUrl from './world-atlas.png';

/**
 * The environment tileset, props and enemy characters, sliced from the supplied
 * art. See tools/slice_tiles.py.
 *
 * The tileset draws platforms as outlined shells over a see-through interior,
 * which is not how YAHIA's ground works — the ground is a solid mass. Interiors
 * are composited onto an opaque base sampled from the art itself, so terrain can
 * never be confused with background, and edge tiles are overlaid where a tile
 * actually borders open air.
 *
 * It ships no slope tiles, so slopes are the surface tile clipped to a triangle
 * with a lit crust drawn along the diagonal in the art's own highlight colour.
 */

type Rect = readonly [number, number, number, number];

const FRAMES = manifest.frames as unknown as Record<string, Rect>;
const ENEMY_META = manifest.enemies as unknown as Record<
  string,
  { frames: string[]; box: Rect }
>;

export type EnemyKind = keyof typeof manifest.enemies & string;
export const ENEMY_KINDS = Object.keys(ENEMY_META) as EnemyKind[];

/** The art's own darkest ground tone and its brightest surface highlight. */
const BASE = `rgb(${(manifest.base as number[]).join(',')})`;
const CRUST = `rgb(${(manifest.crust as number[]).join(',')})`;
const CRUST_UNDER = `rgb(${(manifest.crust2 as number[]).join(',')})`;

let atlas: HTMLImageElement | null = null;

export function loadWorldAtlas(): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      atlas = img;
      resolve();
    };
    img.onerror = () => reject(new Error('world atlas failed to load'));
    img.src = atlasUrl;
  });
}

export function frameRect(key: string): Rect | undefined {
  return FRAMES[key];
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
): void {
  if (atlas === null) return;
  const r = FRAMES[key];
  if (r === undefined) return;
  ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
}

/**
 * Enemy collision box, in world space, for a creature standing at (x, groundY).
 *
 * Taken from the union of its animation frames and then inset, because being
 * killed by one pixel of a hat is the kind of unfairness a reaction runner
 * cannot afford.
 */
export function enemyBox(kind: EnemyKind, x: number, groundY: number) {
  const [, , bw, bh] = ENEMY_META[kind]!.box;
  const w = bw * 0.72;
  const h = bh * 0.86;
  return { x: x - w / 2, y: groundY - h, w, h };
}

export function enemyFrames(kind: EnemyKind): readonly string[] {
  return ENEMY_META[kind]!.frames;
}

/** Where to blit the sprite so its feet land on `groundY` and it is centred. */
export function enemyDrawOrigin(kind: EnemyKind, x: number, groundY: number) {
  const [bx, by, bw, bh] = ENEMY_META[kind]!.box;
  return { x: x - (bx + bw / 2), y: groundY - (by + bh) };
}

type Kind = 'top' | 'deep' | 'slopeR' | 'slopeL' | 'breakable';
/** Which vertical faces of a tile border open air. */
export type Faces = '' | 'L' | 'R' | 'LR';

/**
 * Tiles baked into offscreen canvases at startup, matching TileBank's shape so
 * the renderer does not care which source a biome uses.
 */
export class AtlasTiles {
  private readonly baked = new Map<Kind, HTMLCanvasElement>();
  private readonly faced = new Map<string, HTMLCanvasElement>();
  private readonly props = new Map<string, HTMLCanvasElement>();
  readonly size = TILE;

  constructor() {
    this.baked.set('breakable', this.blit('weakTop'));
    this.baked.set('slopeR', this.slope(true));
    this.baked.set('slopeL', this.slope(false));

    // Edge faces are baked INTO the tile rather than overlaid at draw time.
    // Overlaying cost up to three drawImage calls per tile across ~500 tiles a
    // frame; there are only four possible face combinations, so bake them.
    for (const [kind, key] of [['top', 'groundTop'], ['deep', 'groundFill']] as const) {
      for (const faces of ['', 'L', 'R', 'LR'] as Faces[]) {
        this.faced.set(`${kind}${faces}`, this.blitFaced(key, faces));
      }
      this.baked.set(kind, this.faced.get(`${kind}`)!);
    }
  }

  get(kind: Kind): HTMLCanvasElement {
    return this.baked.get(kind) ?? this.baked.get('deep')!;
  }

  /** One blit per tile, faces included. */
  faced_(kind: 'top' | 'deep', faces: Faces): HTMLCanvasElement {
    return this.faced.get(`${kind}${faces}`)!;
  }

  private blitFaced(key: string, faces: Faces): HTMLCanvasElement {
    const [c, ctx] = this.canvas();
    ctx.imageSmoothingEnabled = false;
    drawFrame(ctx, key, 0, 0);
    if (faces.includes('L')) drawFrame(ctx, 'groundLeft', 0, 0);
    if (faces.includes('R')) drawFrame(ctx, 'groundRight', 0, 0);
    return c;
  }

  /** Props pre-scaled, because scaled drawImage every frame is not free. */
  prop(key: string, scale: number): HTMLCanvasElement {
    const id = `${key}@${scale}`;
    const hit = this.props.get(id);
    if (hit !== undefined) return hit;
    const r = frameRect(key)!;
    const c = document.createElement('canvas');
    c.width = Math.round(r[2] * scale);
    c.height = Math.round(r[3] * scale);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    if (atlas !== null) {
      ctx.drawImage(atlas, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
    }
    this.props.set(id, c);
    return c;
  }

  private canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    return [c, c.getContext('2d')!];
  }

  private blit(key: string): HTMLCanvasElement {
    const [c, ctx] = this.canvas();
    ctx.imageSmoothingEnabled = false;
    drawFrame(ctx, key, 0, 0);
    return c;
  }

  /** No slope tiles exist, so clip the surface tile and light the diagonal. */
  private slope(risingRight: boolean): HTMLCanvasElement {
    const [c, ctx] = this.canvas();
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.beginPath();
    if (risingRight) {
      ctx.moveTo(0, TILE);
      ctx.lineTo(TILE, 0);
      ctx.lineTo(TILE, TILE);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(TILE, TILE);
      ctx.lineTo(0, TILE);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, TILE, TILE);
    drawFrame(ctx, 'groundFill', 0, 0);
    ctx.restore();

    // Two-tone, matching the flat tile's fringe-over-crust rather than one
    // neon stripe down the diagonal.
    const line = (color: string, width: number, drop: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      if (risingRight) {
        ctx.moveTo(0, TILE + drop);
        ctx.lineTo(TILE, drop);
      } else {
        ctx.moveTo(0, drop);
        ctx.lineTo(TILE, TILE + drop);
      }
      ctx.stroke();
    };
    line(CRUST_UNDER, px(3), px(2));
    line(CRUST, px(1.2), 0);
    return c;
  }
}
