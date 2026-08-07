import { Rng } from '../core/rng';
import { TILE, Tile, clamp } from '../game/tiles';
import { T } from '../game/tuning';
import { VIEW_H, VIEW_W } from '../game/view';
import type { World } from '../game/world';
import { P } from './palette';

interface Tower {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Enough silhouettes to cover the scrolled distance of one parallax layer. */
function towerRow(
  rng: Rng,
  scrolledWidth: number,
  spacing: number,
  baseY: number,
  widths: [number, number],
  heights: [number, number],
): Tower[] {
  const count = Math.ceil((scrolledWidth + VIEW_W) / spacing) + 4;
  const out: Tower[] = [];
  for (let i = 0; i < count; i++) {
    const w = rng.int(widths[0], widths[1]);
    const h = rng.int(heights[0], heights[1]);
    out.push({ x: i * spacing + rng.int(-spacing / 4, spacing / 4), y: baseY - h, w, h });
  }
  return out;
}

/**
 * Canvas2D into a 480x270 backbuffer, then nearest-neighbour upscale.
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
    const ctx = this.ctx;
    if (this.builtForSeed !== world.seed) this.buildBackdrop(world.seed, world.level.pxWidth);

    // Integer camera: a pixel grid that wobbles on sub-pixel offsets shimmers.
    const camX = Math.round(world.camX);
    const camY = Math.round(world.camY);

    this.drawSky();
    this.drawTowers(this.farTowers, camX, camY, 0.2, P.ruinFar);
    this.drawTowers(this.nearTowers, camX, camY, 0.45, P.ruinNear);
    this.drawTiles(world, camX, camY);
    this.drawCheckpoints(world, camX, camY);
    this.drawCorpses(world, camX, camY);
    this.drawPlayer(world, camX, camY);

    ctx.imageSmoothingEnabled = false;
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  private drawSky(): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, P.skyTop);
    grad.addColorStop(1, P.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
    this.farTowers = towerRow(rng, levelWidth * 0.2, 46, 205, [14, 34], [30, 96]);
    this.nearTowers = towerRow(rng, levelWidth * 0.45, 64, 228, [20, 52], [24, 70]);
    this.builtForSeed = seed;
  }

  private drawTowers(towers: Tower[], camX: number, camY: number, factor: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const ox = Math.round(camX * factor);
    // Damped and clamped, so the horizon stays put even in a long fall.
    const oy = Math.round(clamp((camY - 300) * factor * 0.12, -20, 20));
    for (const t of towers) {
      const x = t.x - ox;
      if (x + t.w < 0 || x > VIEW_W) continue;
      const y = t.y - oy;
      ctx.fillRect(x, y, t.w, VIEW_H - y);
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
            ctx.fillStyle = exposed ? P.terrain : P.terrainDeep;
            ctx.fillRect(x, y, TILE, TILE);
            if (exposed) {
              ctx.fillStyle = P.terrainLip;
              ctx.fillRect(x, y, TILE, 3);
            }
            break;
          }
          case Tile.SlopeR:
            this.slope(x, y, true);
            break;
          case Tile.SlopeL:
            this.slope(x, y, false);
            break;
          case Tile.Breakable: {
            const fuse = world.fuseAt(tx, ty);
            ctx.fillStyle = P.breakable;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = P.breakableLip;
            ctx.fillRect(x, y, TILE, 2);
            if (fuse !== null) {
              // Telegraph the collapse: cracks widen as the fuse burns.
              ctx.fillStyle = P.terrainDeep;
              const n = 1 + Math.floor(fuse * 4);
              for (let i = 0; i < n; i++) ctx.fillRect(x + 2 + i * 3, y + 3, 1, TILE - 4);
            }
            break;
          }
          case Tile.Spike:
            ctx.fillStyle = P.hazard;
            for (let i = 0; i < 4; i++) {
              const sx = x + i * 4;
              ctx.beginPath();
              ctx.moveTo(sx, y + TILE);
              ctx.lineTo(sx + 2, y + TILE - 9);
              ctx.lineTo(sx + 4, y + TILE);
              ctx.closePath();
              ctx.fill();
            }
            break;
          case Tile.Goal:
            ctx.fillStyle = P.goal;
            ctx.fillRect(x + 6, y - TILE * 2, 3, TILE * 3);
            ctx.fillRect(x + 9, y - TILE * 2, 8, 6);
            break;
          default:
            break;
        }
      }
    }
  }

  private slope(x: number, y: number, risingRight: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = P.terrain;
    ctx.beginPath();
    if (risingRight) {
      ctx.moveTo(x, y + TILE);
      ctx.lineTo(x + TILE, y);
      ctx.lineTo(x + TILE, y + TILE);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + TILE, y + TILE);
      ctx.lineTo(x, y + TILE);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = P.terrainLip;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (risingRight) {
      ctx.moveTo(x, y + TILE);
      ctx.lineTo(x + TILE, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + TILE, y + TILE);
    }
    ctx.stroke();
  }

  private drawCheckpoints(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = P.checkpoint;
    for (const cp of world.level.checkpoints) {
      const x = cp.x - camX;
      if (x < -8 || x > VIEW_W + 8) continue;
      ctx.globalAlpha = cp.x <= world.player.x ? 1 : 0.35;
      ctx.fillRect(x, cp.y - camY - 18, 2, 18);
      ctx.fillRect(x + 2, cp.y - camY - 18, 7, 5);
    }
    ctx.globalAlpha = 1;
  }

  private drawCorpses(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const c of world.corpses) {
      const x = c.x - camX;
      if (x + c.w < 0 || x > VIEW_W) continue;
      const y = c.y - camY;
      const age = world.timeMs - c.born;
      const left = T.corpseLifeMs - age;

      // Fairness: a platform must never vanish unannounced.
      let alpha = 1;
      if (left < T.corpseWarnMs) {
        const pulse = Math.sin((left / T.corpseWarnMs) * Math.PI * 8);
        alpha = 0.45 + 0.55 * (pulse * 0.5 + 0.5);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = P.corpse;
      ctx.fillRect(x, y, c.w, c.h);
      ctx.fillStyle = P.corpseEdge;
      ctx.fillRect(x, y, c.w, 2);
      ctx.fillRect(x, y, 1, c.h);
      ctx.fillRect(x + c.w - 1, y, 1, c.h);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(world: World, camX: number, camY: number): void {
    const p = world.player;
    if (!p.alive) return;
    const ctx = this.ctx;
    const x = Math.round(p.x - camX);
    const y = Math.round(p.y - camY);

    // Speed streaks: the momentum model needs to be legible at a glance.
    const speedT = clamp((p.vx - T.baseSpeed) / Math.max(1, T.maxSpeed - T.baseSpeed), 0, 1);
    if (speedT > 0.05) {
      ctx.globalAlpha = speedT * 0.5;
      ctx.fillStyle = P.playerSash;
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(x - i * 7, y + 3 + i * 2, 5 + speedT * 8, 1);
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = P.playerShadow;
    ctx.fillRect(x + 1, y + 1, p.w, p.h);
    ctx.fillStyle = P.player;
    ctx.fillRect(x, y, p.w, p.h);

    ctx.fillStyle = P.playerSash;
    if (p.sliding) {
      ctx.fillRect(x, y + 3, p.w, 3);
    } else {
      ctx.fillRect(x, y + 7, p.w, 4);
      ctx.fillRect(x + p.w - 4, y + 2, 4, 3);
    }

    if (p.fastFalling) {
      ctx.fillStyle = P.playerSash;
      ctx.fillRect(x + 2, y + p.h, p.w - 4, 3);
    }
  }
}
