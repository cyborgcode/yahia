import { Rng } from '../core/rng';
import { px } from '../game/scale';
import { TILE, Tile, clamp } from '../game/tiles';
import { T } from '../game/tuning';
import { VIEW_H, VIEW_W } from '../game/view';
import type { World } from '../game/world';
import { P } from './palette';
import { RUN_CYCLE, SpriteBank, type SpriteName } from './sprites';
import { BackdropBank, TileBank } from './tileart';
import { THEME } from './themes';
import {
  AtlasTiles,
  drawFrame,
  enemyDrawOrigin,
  enemyFrames,
  frameRect,
  type EnemyKind,
  type Faces,
} from './worldart';

interface Tower {
  x: number;
  y: number;
  /** Which baked silhouette this instance blits. */
  variant: number;
}

/** Enough placements to cover the scrolled distance of one parallax layer. */
function towerRow(
  rng: Rng,
  scrolledWidth: number,
  spacing: number,
  baseY: number,
  heights: [number, number],
  variantCount: number,
): Tower[] {
  const count = Math.ceil((scrolledWidth + VIEW_W) / spacing) + 4;
  const out: Tower[] = [];
  for (let i = 0; i < count; i++) {
    const h = rng.int(heights[0], heights[1]);
    out.push({
      x: i * spacing + rng.int(-spacing / 4, spacing / 4),
      y: baseY - h,
      variant: rng.int(0, variantCount - 1),
    });
  }
  return out;
}

/**
 * Canvas2D into a SCALE-derived backbuffer, then nearest-neighbour upscale.
 *
 * Deliberately not PixiJS yet: with placeholder art there is nothing for WebGL
 * to accelerate, and this removes all engine setup risk from the one question
 * the prototype exists to answer. Everything renderer-shaped lives behind this
 * module, so swapping in Pixi when real atlases land is contained.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private farTowers: Tower[] = [];
  private nearTowers: Tower[] = [];
  private builtForSeed = -1;
  private readonly sprites = new SpriteBank();
  /**
   * Per-stage draw cost, in ms, as an exponential moving average. Off unless
   * asked for: on a mobile-first game the only way to find a fill-rate
   * regression is to measure which stage actually costs it.
   */
  readonly timings: Record<string, number> = {};
  profiling = false;
  /** Flat tiles instead of textured — the low-end fallback, and an A/B handle. */
  flatTiles = false;
  /** Diagnostic: skip all drawing to isolate simulation cost from render cost. */
  enabled = true;
  private stageStart = 0;
  // A biome either generates its tiles or slices them from a real tileset;
  // both answer get(kind), so nothing downstream cares which.
  private readonly tiles = THEME.art === 'atlas' ? new AtlasTiles() : new TileBank();
  private readonly sky = this.bakeSky();
  private readonly farBank = new BackdropBank(0x51ed, THEME.far, THEME.detail, [px(14), px(34)], false);
  private readonly nearBank = new BackdropBank(0xb00c, THEME.near, THEME.detail, [px(20), px(52)], true);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx === null) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  draw(world: World): void {
    if (!this.enabled) return;
    const ctx = this.ctx;
    if (this.builtForSeed !== world.seed) this.buildBackdrop(world.seed, world.level.pxWidth);

    // Integer camera: a pixel grid that wobbles on sub-pixel offsets shimmers.
    const camX = Math.round(world.camX);
    const camY = Math.round(world.camY);

    if (this.profiling) this.stageStart = performance.now();
    this.drawSky();
    this.mark('sky');
    if (THEME.art === 'atlas') {
      this.drawGrove(camX, camY);
    } else {
      this.drawTowers(this.farTowers, this.farBank, camX, camY, 0.2);
      this.drawTowers(this.nearTowers, this.nearBank, camX, camY, 0.45);
    }
    this.mark('towers');
    this.drawTiles(world, camX, camY);
    this.mark('tiles');
    this.drawCheckpoints(world, camX, camY);
    this.drawEnemies(world, camX, camY);
    this.drawCorpses(world, camX, camY);
    this.drawPlayer(world, camX, camY);
    this.mark('actors');

    ctx.imageSmoothingEnabled = false;
  }

  private mark(name: string): void {
    if (!this.profiling) return;
    const now = performance.now();
    const dt = now - this.stageStart;
    this.timings[name] = (this.timings[name] ?? dt) * 0.9 + dt * 0.1;
    this.stageStart = now;
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * The sky is baked once, not drawn.
   *
   * Two full-screen gradients rasterised every frame cost the entire frame
   * budget: nulling this stage alone took a 4x-throttled phone profile from
   * 20.6fps to 60.3fps. Nothing here ever changes — it does not even scroll —
   * so it becomes one opaque blit.
   */
  private bakeSky(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, THEME.skyTop);
    grad.addColorStop(1, THEME.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Haze on the horizon, so the sky has depth instead of one flat ramp.
    const haze = ctx.createLinearGradient(0, VIEW_H * 0.42, 0, VIEW_H * 0.86);
    haze.addColorStop(0, `rgba(${THEME.haze},0)`);
    haze.addColorStop(0.55, `rgba(${THEME.haze},0.16)`);
    haze.addColorStop(1, `rgba(${THEME.haze},0)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, VIEW_H * 0.42, VIEW_W, VIEW_H * 0.44);

    return canvas;
  }

  private drawSky(): void {
    this.ctx.drawImage(this.sky, 0, 0);
  }

  /**
   * Ruins are laid out in screen space, not world space: their bases sit near a
   * fixed horizon and only drift a little vertically. Anchoring them to world Y
   * lets the skyline climb into the play area whenever the camera drops down a
   * shaft, which reads as foreground and is exactly the background-becomes-
   * floor confusion the palette rules exist to prevent.
   */
  private buildBackdrop(seed: number, levelWidth: number): void {
    const rng = new Rng(seed ^ 0x9e3779b9);
    this.farTowers = towerRow(rng, levelWidth * 0.2, px(46), px(205), [px(30), px(96)], this.farBank.variants.length);
    this.nearTowers = towerRow(rng, levelWidth * 0.45, px(64), px(228), [px(24), px(70)], this.nearBank.variants.length);
    this.builtForSeed = seed;
  }

  private drawTowers(
    towers: Tower[],
    bank: BackdropBank,
    camX: number,
    camY: number,
    factor: number,
  ): void {
    const ctx = this.ctx;
    const ox = Math.round(camX * factor);
    // Damped and clamped, so the horizon stays put even in a long fall.
    const oy = Math.round(clamp((camY - px(300)) * factor * 0.12, -px(20), px(20)));

    for (const t of towers) {
      const img = bank.get(t.variant);
      const x = t.x - ox;
      if (x + img.width < 0 || x > VIEW_W) continue;
      ctx.drawImage(img, x, t.y - oy);
    }
  }

  private drawTiles(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    const level = world.level;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const tx1 = Math.min(level.w - 1, Math.ceil((camX + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const ty1 = Math.min(level.h - 1, Math.ceil((camY + VIEW_H) / TILE));

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = level.get(tx, ty);
        if (t === Tile.Empty) continue;
        const x = tx * TILE - camX;
        const y = ty * TILE - camY;

        switch (t) {
          case Tile.Solid: {
            const exposed = level.get(tx, ty - 1) === Tile.Empty;
            if (this.tiles instanceof AtlasTiles) {
              // The tileset draws platforms as shells, so a face only exists
              // where the ground borders air — and only near the surface. The
              // edge tile is a mossy trim, and repeated twenty tiles down a
              // cliff it reads as a dangling chain rather than a wall.
              const nearSurface =
                exposed ||
                level.get(tx, ty - 2) === Tile.Empty ||
                level.get(tx, ty - 3) === Tile.Empty;
              let faces: Faces = '';
              if (nearSurface) {
                if (level.get(tx - 1, ty) === Tile.Empty) faces = 'L';
                if (level.get(tx + 1, ty) === Tile.Empty) faces = faces === 'L' ? 'LR' : 'R';
              }
              ctx.drawImage(this.tiles.faced_(exposed ? 'top' : 'deep', faces), x, y);
              break;
            }
            if (this.flatTiles) {
              ctx.fillStyle = exposed ? THEME.body : THEME.bodyDeep;
              ctx.fillRect(x, y, TILE, TILE);
              if (exposed) {
                ctx.fillStyle = THEME.cap;
                ctx.fillRect(x, y, TILE, px(3));
              }
            } else {
              ctx.drawImage((this.tiles as TileBank).get(exposed ? 'top' : 'deep', tx, ty), x, y);
            }
            break;
          }
          case Tile.SlopeR:
            ctx.drawImage(this.tileFor('slopeR', tx, ty), x, y);
            break;
          case Tile.SlopeL:
            ctx.drawImage(this.tileFor('slopeL', tx, ty), x, y);
            break;
          case Tile.Breakable: {
            ctx.drawImage(this.tileFor('breakable', tx, ty), x, y);
            const fuse = world.fuseAt(tx, ty);
            if (fuse !== null) {
              // Telegraph the collapse: cracks widen as the fuse burns.
              ctx.fillStyle = THEME.bodyDeep;
              const n = 1 + Math.floor(fuse * 4);
              for (let i = 0; i < n; i++) {
                ctx.fillRect(x + px(2) + i * px(3), y + px(3), px(1), TILE - px(4));
              }
            }
            break;
          }
          case Tile.Spike:
            this.spikes(x, y);
            break;
          case Tile.Goal:
            ctx.fillStyle = P.goal;
            ctx.fillRect(x + px(6), y - TILE * 2, px(3), TILE * 3);
            ctx.fillRect(x + px(9), y - TILE * 2, px(8), px(6));
            break;
          default:
            break;
        }
      }
    }
  }

  private tileFor(
    kind: 'top' | 'deep' | 'slopeR' | 'slopeL' | 'breakable',
    tx: number,
    ty: number,
  ): HTMLCanvasElement {
    return this.tiles instanceof AtlasTiles
      ? this.tiles.get(kind)
      : this.tiles.get(kind, tx, ty);
  }

  /**
   * Creatures, animated in place.
   *
   * They break the palette's one-hazard-colour rule on purpose: a character is
   * read as dangerous by being a character, which is a stronger signal than any
   * hue. The pulsing mark beneath keeps them inside the same visual language
   * anyway, so a glance still parses them as "do not touch".
   */
  private drawEnemies(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const e of world.level.enemies) {
      const sx = e.x - camX;
      if (sx < -px(40) || sx > VIEW_W + px(40)) continue;
      const sy = e.y - camY;

      const pulse = 0.35 + 0.25 * Math.sin(world.timeMs / 260 + e.x);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = THEME.hazard;
      ctx.fillRect(sx - px(7), sy - px(1), px(14), px(2));
      ctx.globalAlpha = 1;

      const frames = enemyFrames(e.kind as EnemyKind);
      const frame = frames[Math.floor(world.timeMs / 160) % frames.length]!;
      const o = enemyDrawOrigin(e.kind as EnemyKind, sx, sy);
      drawFrame(ctx, frame, o.x, o.y);
    }
  }

  /**
   * A grove: the tileset's dead tree at two parallax depths, with a moon fixed
   * in the sky. Positions come from the level seed, so the same track always
   * grows the same trees.
   */
  private drawGrove(camX: number, camY: number): void {
    const ctx = this.ctx;
    const moon = frameRect('moon0');
    if (moon !== undefined) {
      drawFrame(ctx, 'moon0', VIEW_W * 0.74 - camX * 0.04, px(24) - camY * 0.03);
    }
    if (frameRect('tree') === undefined) return;

    for (const layer of [
      { factor: 0.22, spacing: px(132), alpha: 0.72, scale: 0.72, base: px(216) },
      { factor: 0.45, spacing: px(176), alpha: 1, scale: 1, base: px(240) },
    ]) {
      const img = (this.tiles as AtlasTiles).prop('tree', layer.scale);
      const ox = camX * layer.factor;
      const oy = clamp((camY - px(300)) * layer.factor * 0.12, -px(20), px(20));
      const first = Math.floor((ox - img.width) / layer.spacing);
      const last = Math.ceil((ox + VIEW_W) / layer.spacing);
      ctx.globalAlpha = layer.alpha;
      for (let i = first; i <= last; i++) {
        const jitter = ((Math.imul(i, 2654435761) >>> 0) % 1000) / 1000;
        const x = i * layer.spacing - ox + jitter * px(30);
        const y = layer.base - img.height - oy + jitter * px(14);
        ctx.drawImage(img, Math.round(x), Math.round(y));
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Hazards keep their one saturated colour but gain a lit edge and a base. */
  private spikes(x: number, y: number): void {
    const ctx = this.ctx;
    const n = 4;
    const w = TILE / n;
    for (let i = 0; i < n; i++) {
      const sx = x + i * w;
      const tip = y + TILE - px(9);
      ctx.fillStyle = THEME.hazardDark;
      ctx.beginPath();
      ctx.moveTo(sx, y + TILE);
      ctx.lineTo(sx + w / 2, tip);
      ctx.lineTo(sx + w, y + TILE);
      ctx.closePath();
      ctx.fill();
      // Lit left face, so a spike reads as a solid object rather than a flat cut-out.
      ctx.fillStyle = THEME.hazard;
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.12, y + TILE);
      ctx.lineTo(sx + w / 2, tip);
      ctx.lineTo(sx + w * 0.5, y + TILE);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = THEME.hazardDark;
    ctx.fillRect(x, y + TILE - px(1), TILE, px(1));
  }

  private drawCheckpoints(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = P.checkpoint;
    for (const cp of world.level.checkpoints) {
      const x = cp.x - camX;
      if (x < -px(8) || x > VIEW_W + px(8)) continue;
      ctx.globalAlpha = cp.x <= world.player.x ? 1 : 0.35;
      ctx.fillRect(x, cp.y - camY - px(18), px(2), px(18));
      ctx.fillRect(x + px(2), cp.y - camY - px(18), px(7), px(5));
    }
    ctx.globalAlpha = 1;
  }

  private drawCorpses(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const c of world.corpses) {
      const x = c.x - camX;
      if (x + c.w < 0 || x > VIEW_W) continue;
      const y = c.y - camY;
      const left = T.corpseLifeMs - (world.timeMs - c.born);

      // Fairness: a platform must never vanish unannounced.
      let alpha = 1;
      if (left < T.corpseWarnMs) {
        const pulse = Math.sin((left / T.corpseWarnMs) * Math.PI * 8);
        alpha = 0.45 + 0.55 * (pulse * 0.5 + 0.5);
      }

      ctx.globalAlpha = alpha;
      this.sprites.draw(ctx, 'corpse', x, y);
      // The body is art; this line is the contract. It spans the full collision
      // box, not the silhouette, so the landable edges are never guessed at.
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = P.corpseEdge;
      ctx.fillRect(x, y, c.w, Math.max(2, px(0.5)));
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(world: World, camX: number, camY: number): void {
    const p = world.player;
    if (!p.alive) return;
    const ctx = this.ctx;
    const x = p.x - camX;
    const y = p.y - camY;

    // Speed streaks: the momentum model needs to be legible at a glance.
    const speedT = clamp((p.vx - T.baseSpeed) / Math.max(1, T.maxSpeed - T.baseSpeed), 0, 1);
    if (speedT > 0.05) {
      ctx.globalAlpha = speedT * 0.5;
      ctx.fillStyle = P.playerSash;
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(Math.round(x) - i * px(7), Math.round(y) + px(5) + i * px(3), px(5) + speedT * px(8), px(1));
      }
      ctx.globalAlpha = 1;
    }

    this.sprites.draw(ctx, playerFrame(p), x, y);

    if (p.fastFalling) {
      ctx.fillStyle = P.playerSash;
      ctx.fillRect(Math.round(x) + px(2), Math.round(y) + p.h, p.w - px(4), px(3));
    }
  }
}

/** Stride-driven, so footfalls stay in step with however fast you're moving. */
function playerFrame(p: World['player']): SpriteName {
  if (p.sliding) return 'slide';
  if (!p.grounded) return p.vy < 0 ? 'jump' : 'fall';
  const step = Math.floor(p.distance / px(9)) % RUN_CYCLE.length;
  return RUN_CYCLE[step]!;
}
