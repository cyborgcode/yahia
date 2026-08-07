import { Rng } from '../core/rng';
import { px } from '../game/scale';
import { TILE } from '../game/tiles';
import { VIEW_H } from '../game/view';
import { THEME, type Theme } from './themes';

/**
 * Procedural tile and backdrop textures, baked once into offscreen canvases.
 *
 * The terrain had the same flaw the character did before the real art landed:
 * flat fills with no grain and no form. Here that means layered ground, a lit
 * surface with an irregular fringe, weathering speckle, and ambient shading
 * down the face.
 *
 * Generated rather than authored so the detail follows SCALE automatically and
 * is always 1:1 with the backbuffer, never an upscaled 16px tile — and so a new
 * biome is a palette entry rather than a new set of hand-drawn tiles.
 *
 * Several variants per kind, chosen by a hash of the tile's world position, so
 * a long floor doesn't visibly repeat. Deterministic: a tile never shimmers and
 * looks identical on every player's phone.
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

/** Deterministic value noise in [0,1). No Math.random — tiles must never shimmer. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export class TileBank {
  private readonly baked = new Map<Kind, HTMLCanvasElement[]>();
  readonly size: number;
  /** Flat colour for earth too deep to have any detail worth drawing. */
  readonly deepColor: string;

  constructor(
    private readonly theme: Theme = THEME,
    size = TILE,
  ) {
    this.size = size;
    this.deepColor = theme.bodyDeep;
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
    const T = this.theme;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const data = img.data;

    const isWeak = kind === 'breakable';
    const base = rgb(isWeak ? T.weak : T.body);
    const dark = rgb(isWeak ? T.weakDark : T.bodyDark);
    const deep = rgb(T.bodyDeep);
    const seam = rgb(T.seam);
    const cap = rgb(T.cap);
    const capLit = rgb(T.capLit);

    const blockW = S / 2;
    const blockH = S / 3;
    const capBase = Math.round(S * (T.fringe === 'grass' ? 0.14 : 0.22));
    const unit = Math.max(1, S / 48);

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;

        // Slopes are the same ground, clipped to a triangle.
        if (kind === 'slopeR' && y < S - x - 1) continue;
        if (kind === 'slopeL' && y < x) continue;

        // Deeper ground is darker: cheap ambient occlusion down the face.
        const depth = kind === 'deep' ? 0.55 : (y / S) * 0.42;
        let c = mix(base, deep, depth);

        if (T.surface === 'masonry') {
          const course = Math.floor(y / blockH);
          const offset = course % 2 === 0 ? 0 : blockW / 2;
          if (y % blockH < unit || (x + offset) % blockW < unit) c = mix(c, seam, 0.75);
        } else {
          // Earth: soft horizontal striations that wander, plus buried stones.
          const wobble = hash2(Math.floor(x / 5), 0, variant + 5) * S * 0.22;
          const band = (y + wobble) % (S / 2.2);
          if (band < unit * 2.5) c = mix(c, seam, 0.55);
          else if (band < unit * 4) c = mix(c, dark, 0.22);
          // Buried stones, in clusters rather than single stray pixels.
          const sx4 = Math.floor(x / 3);
          const sy4 = Math.floor(y / 3);
          const stone = hash2(sx4, sy4, variant + 17);
          if (stone > 0.93) c = mix(c, dark, 0.6);
          else if (stone > 0.90) c = mix(c, cap, 0.12);
        }

        // Weathering grain.
        const n = hash2(x, y, variant * 31 + 1);
        if (n < 0.07) c = mix(c, dark, 0.5);
        else if (n > 0.93) c = mix(c, cap, 0.18);

        // The lit surface, on anything you can stand on.
        if (kind !== 'deep') {
          const surface = kind === 'slopeR' ? S - x - 1 : kind === 'slopeL' ? x : 0;
          const below = y - surface;
          // Grass fringes in irregular blades; stone chips in flatter flakes.
          const jag =
            T.fringe === 'grass'
              ? Math.round(hash2(x, 1, variant * 13 + 3) * Math.max(3, S / 7))
              : Math.round(hash2(x, 0, variant * 13 + 3) * Math.max(2, S / 12));
          const capH = isWeak ? Math.max(2, S / 12) : capBase + jag;
          if (below >= 0 && below < capH) {
            const t = 1 - below / capH;
            c = mix(c, below < unit * 2 ? capLit : cap, 0.55 + t * 0.35);
          }
        }

        // Breakable ground advertises its own fragility.
        if (isWeak) {
          const crack = hash2(Math.floor(x / 2) * 2, Math.floor(y / 5) * 5, variant + 9);
          if (crack > 0.965) c = mix(c, deep, 0.6);
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

/**
 * Backdrop silhouettes, baked once into offscreen canvases.
 *
 * Drawing these with fillRect per frame cost ~5,000 draw calls. They never
 * change, so they are baked at startup and blitted: a few dozen drawImage calls.
 */
export class BackdropBank {
  readonly variants: HTMLCanvasElement[] = [];

  constructor(
    seed: number,
    color: string,
    detailColor: string,
    widthRange: [number, number],
    detailed: boolean,
    theme: Theme = THEME,
    count = 6,
  ) {
    const rng = new Rng(seed);
    const height = VIEW_H + px(60);

    for (let v = 0; v < count; v++) {
      const w = rng.int(widthRange[0], widthRange[1]);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      if (theme.backdrop === 'trees') {
        this.tree(ctx, rng, w, height, color, detailColor, detailed);
      } else {
        this.tower(ctx, rng, w, height, color, detailColor, detailed);
      }
      this.variants.push(canvas);
    }
  }

  get(index: number): HTMLCanvasElement {
    return this.variants[index % this.variants.length]!;
  }

  private tower(
    ctx: CanvasRenderingContext2D,
    rng: Rng,
    w: number,
    height: number,
    color: string,
    detailColor: string,
    detailed: boolean,
  ): void {
    const merlon = Math.max(2, px(3));
    ctx.fillStyle = color;
    ctx.fillRect(0, merlon, w, height - merlon);

    // Battlements: a ruined skyline reads as architecture; a flat-topped
    // rectangle reads as a bar chart.
    const merlons = 2 + rng.int(0, 2);
    const step = w / (merlons * 2 + 1);
    for (let i = 0; i <= merlons; i++) {
      const mh = merlon * (1 + rng.int(0, 1));
      ctx.fillRect(step * (i * 2), merlon - mh, step, mh + merlon);
    }

    if (!detailed) return;
    ctx.fillStyle = detailColor;
    for (let wy = px(8); wy < height; wy += px(11)) {
      for (let wx = px(3); wx + px(3) < w - px(2); wx += px(9)) {
        if (rng.next() < 0.2) continue;
        ctx.fillRect(wx, wy, px(3), px(5));
      }
    }
  }

  private tree(
    ctx: CanvasRenderingContext2D,
    rng: Rng,
    w: number,
    height: number,
    color: string,
    detailColor: string,
    detailed: boolean,
  ): void {
    // A forest backdrop is a canopy, not a row of lollipops: the foliage mass
    // has to be broad and deep enough to close over, with only a little trunk
    // showing beneath it.
    const canopyH = w * 1.5;
    const trunkW = Math.max(2, Math.round(w * 0.13));

    ctx.fillStyle = detailColor;
    ctx.fillRect(Math.round(w / 2 - trunkW / 2), canopyH * 0.55, trunkW, height);

    ctx.fillStyle = color;
    const blobs = 9 + rng.int(0, 4);
    for (let i = 0; i < blobs; i++) {
      const bx = w / 2 + (rng.next() - 0.5) * w * 1.05;
      const by = canopyH * (0.18 + rng.next() * 0.62);
      const br = w * (0.26 + rng.next() * 0.22);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    // Close the underside so the canopy is a mass, not a cluster of balls.
    ctx.fillRect(w * 0.08, canopyH * 0.3, w * 0.84, canopyH * 0.35);

    if (!detailed) return;

    // Gaps where light comes through the leaves.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      const gx = w / 2 + (rng.next() - 0.5) * w * 1.1;
      const gy = canopyH * (0.15 + rng.next() * 0.6);
      ctx.beginPath();
      ctx.arc(gx, gy, Math.max(1, px(2)) * (0.5 + rng.next()), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
