import { TILE } from '../game/tiles';

/**
 * Procedural tile textures, baked once into offscreen canvases at startup.
 *
 * The terrain had the same flaw the character did before it was redrawn: flat
 * fills with no outline, no grain and no form. Here that means masonry courses,
 * weathering speckle, ambient shading down the face, and a sun-bleached cap
 * with a chipped edge on any surface you can stand on.
 *
 * Generated rather than authored so it follows SCALE automatically — the detail
 * is always 1:1 with the backbuffer, never an upscaled 16px tile.
 *
 * Several variants per kind, chosen by a hash of the tile's world position, so
 * a long stone floor doesn't visibly tile. Deterministic: the same tile is the
 * same texture every frame, and on every player's phone.
 */

const VARIANTS = 4;

type Kind = 'top' | 'deep' | 'slopeR' | 'slopeL' | 'breakable';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const rgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const STONE = rgb('#6d4c33');
const STONE_DARK = rgb('#4a3323');
const STONE_DEEP = rgb('#33241a');
const MORTAR = rgb('#3d2a1d');
const CAP = rgb('#b98d5f');
const CAP_LIT = rgb('#d8ac7a');
const BRICK = rgb('#7a6a55');
const BRICK_DARK = rgb('#584c3d');

/** Deterministic value noise in [0,1). No Math.random — tiles must never shimmer. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export class TileBank {
  private readonly baked = new Map<Kind, HTMLCanvasElement[]>();
  readonly size: number;

  constructor(size = TILE) {
    this.size = size;
    for (const kind of ['top', 'deep', 'slopeR', 'slopeL', 'breakable'] as Kind[]) {
      const list: HTMLCanvasElement[] = [];
      for (let v = 0; v < VARIANTS; v++) list.push(this.bake(kind, v));
      this.baked.set(kind, list);
    }
  }

  /** Variant chosen from world position, so the same tile always looks the same. */
  get(kind: Kind, tx: number, ty: number): HTMLCanvasElement {
    const list = this.baked.get(kind)!;
    return list[Math.floor(hash2(tx, ty, 7) * VARIANTS) % VARIANTS]!;
  }

  private bake(kind: Kind, variant: number): HTMLCanvasElement {
    const S = this.size;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const data = img.data;

    const isBrick = kind === 'breakable';
    const base = isBrick ? BRICK : STONE;
    const dark = isBrick ? BRICK_DARK : STONE_DARK;

    // Masonry: two blocks across, three courses down, alternating like brickwork.
    const blockW = S / 2;
    const blockH = S / 3;
    // A chipped, irregular cap edge rather than a ruled line.
    const capBase = Math.round(S * 0.22);

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;

        // Slopes are the same stone, clipped to a triangle.
        if (kind === 'slopeR' && y < S - x - 1) continue;
        if (kind === 'slopeL' && y < x) continue;

        const course = Math.floor(y / blockH);
        const offset = course % 2 === 0 ? 0 : blockW / 2;
        const joint =
          y % blockH < Math.max(1, S / 48) ||
          (x + offset) % blockW < Math.max(1, S / 48);

        // Deeper stone is darker: cheap ambient occlusion down the face.
        const depth = kind === 'deep' ? 0.55 : (y / S) * 0.42;
        let c = mix(base, STONE_DEEP, depth);
        if (joint) c = mix(c, MORTAR, 0.75);

        // Weathering grain.
        const n = hash2(x, y, variant * 31 + 1);
        if (n < 0.07) c = mix(c, dark, 0.5);
        else if (n > 0.93) c = mix(c, CAP, 0.22);

        // Sun-bleached cap on anything you can stand on.
        if (kind === 'top' || kind === 'slopeR' || kind === 'slopeL' || isBrick) {
          const chip = Math.round(hash2(x, 0, variant * 13 + 3) * Math.max(2, S / 12));
          const surface =
            kind === 'slopeR' ? S - x - 1 : kind === 'slopeL' ? x : 0;
          const depthFromSurface = y - surface;
          const capH = isBrick ? Math.max(2, S / 12) : capBase + chip;
          if (depthFromSurface >= 0 && depthFromSurface < capH) {
            const t = 1 - depthFromSurface / capH;
            c = mix(c, depthFromSurface < Math.max(1, S / 24) ? CAP_LIT : CAP, 0.55 + t * 0.35);
          }
        }

        // Breakable stone advertises its own fragility.
        if (isBrick) {
          const crack = hash2(Math.floor(x / 2) * 2, Math.floor(y / 5) * 5, variant + 9);
          if (crack > 0.965) c = mix(c, STONE_DEEP, 0.6);
        }

        data[i] = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}
