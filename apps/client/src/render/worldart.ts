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
  /** Flat colour for earth too deep to have any detail worth drawing. */
  readonly deepColor = BASE;

  /**
   * The earth under the crust, as a repeating pattern rather than a flat colour.
   *
   * One fillRect with a pattern costs about what one fillRect costs; drawing the
   * same area as individual tiles cost 11fps. At 10 tiles across, the flat slab
   * this replaces was a third of the screen with nothing in it.
   */
  readonly deepFill: CanvasPattern | string = BASE;

  constructor() {
    this.baked.set('breakable', this.blit('weakTop'));
    this.baked.set('slopeR', this.slope(true));
    this.baked.set('slopeL', this.slope(false));

    // Edge faces are baked INTO the tile rather than overlaid at draw time.
    // Overlaying cost up to three drawImage calls per tile across ~500 tiles a
    // frame; there are only four possible face combinations, so bake them.
    //
    // The surface has two variants in the tileset and only one was ever used,
    // which at this zoom made every metre of ground identical. Both are baked
    // and picked by world position, so the ground line stops repeating.
    // Bedrock is one material whether it arrives as a tile or as the flood fill
    // below them. Baked first, and used as the source for the deep tile: while
    // the tile was the tileset's blank interior and the flood was textured, the
    // boundary between them showed as a hard horizontal seam across the screen.
    const bedrock = this.bakeDeepTexture();

    for (const [kind, sources] of [
      ['top', ['groundTop', 'groundTop2']],
      ['deep', [bedrock]],
    ] as [Kind, (string | HTMLCanvasElement)[]][]) {
      sources.forEach((source, variant) => {
        for (const faces of ['', 'L', 'R', 'LR'] as Faces[]) {
          this.faced.set(`${kind}${variant}${faces}`, this.blitFaced(source, faces));
        }
      });
      this.baked.set(kind, this.faced.get(`${kind}0`)!);
    }

    const probe = document.createElement('canvas').getContext('2d');
    this.deepFill = probe?.createPattern(bedrock, 'repeat') ?? BASE;
  }

  /**
   * Bedrock: strata and grit over the art's own base tone.
   *
   * Generated rather than sliced, because the tileset has nothing for this. Its
   * "interior" tile is genuinely blank — it is meant to sit behind an outlined
   * platform shell a few tiles tall, not to be the bottom third of the screen,
   * which is what it became when the view zoomed in. Patterning it changed
   * nothing at all, because there was nothing in it to repeat.
   *
   * Deliberately low contrast. This is the one region of the screen that must
   * never suggest an edge you could stand on, so it gets texture without
   * feature: no highlights, no horizontals strong enough to read as a ledge.
   */
  private bakeDeepTexture(): HTMLCanvasElement {
    const S = TILE;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    const [br, bg, bb] = manifest.base as number[] as [number, number, number];

    const img = ctx.createImageData(S, S);
    const d = img.data;
    // Any tile-sized canvas repeats seamlessly by construction; the only seam
    // that could show is in the noise, and fine grit has none to show.
    const hash = (x: number, y: number, salt: number): number => {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519)) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
      return ((Math.imul(h, 1274126177) ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    for (let y = 0; y < S; y++) {
      // Strata: broad, soft bands that drift, so the rock has bedding planes
      // rather than stripes.
      const band = Math.sin((y / S) * Math.PI * 2) * 0.5 + Math.sin((y / S) * Math.PI * 6) * 0.2;
      for (let x = 0; x < S; x++) {
        const grit = hash(x, y, 7) - 0.5;
        const stone = hash(x >> 2, y >> 2, 31);
        // Absolute levels, not a percentage. The base tone is rgb(39,32,52), so
        // a 7% shade is under three levels — invisible, which is exactly what
        // the first attempt at this looked like.
        // Grain over banding. The strata are one tile long, so any strength in
        // them repeats as hard stripes every 48px; grit has no period to show.
        let shade = band * 3.5 + grit * 15;
        if (stone > 0.955) shade += 16;
        const i = (y * S + x) * 4;
        d[i] = Math.max(0, Math.min(255, Math.round(br + shade)));
        d[i + 1] = Math.max(0, Math.min(255, Math.round(bg + shade)));
        // Blue lifts a little faster, so depth cools rather than just lightens.
        d[i + 2] = Math.max(0, Math.min(255, Math.round(bb + shade * 1.35)));
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  get(kind: Kind): HTMLCanvasElement {
    return this.baked.get(kind) ?? this.baked.get('deep')!;
  }

  /** How many surface variants exist, so the caller can pick one. */
  readonly topVariants = 2;

  /** One blit per tile, faces included. */
  faced_(kind: 'top' | 'deep', faces: Faces, variant = 0): HTMLCanvasElement {
    const v = kind === 'top' ? variant % this.topVariants : 0;
    return this.faced.get(`${kind}${v}${faces}`)!;
  }

  private blitFaced(source: string | HTMLCanvasElement, faces: Faces): HTMLCanvasElement {
    const [c, ctx] = this.canvas();
    ctx.imageSmoothingEnabled = false;
    if (typeof source === 'string') drawFrame(ctx, source, 0, 0);
    else ctx.drawImage(source, 0, 0);
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
