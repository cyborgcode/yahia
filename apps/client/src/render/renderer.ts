import { Rng } from '../core/rng';
import { px } from '../game/scale';
import { TILE, Tile, clamp } from '../game/tiles';
import { T } from '../game/tuning';
import { VIEW_H, VIEW_W } from '../game/view';
import { BASE_ROW, type Level } from '../game/level';
import type { World } from '../game/world';
import { P } from './palette';
import { KITS, KIT_COMBOS } from './hero';
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

/**
 * Where a backdrop layer stands: this far below the ground line.
 *
 * These used to be absolute px() values, which quietly encoded "a bit below the
 * ground line in a 270-tall view" — so raising the viewport for portrait left
 * the skyline stranded in mid-sky. The thing they are actually relative to is
 * the ground line, and the camera centres the runner, so the ground line is the
 * middle of the viewport whatever its height. Anchor there instead.
 */
const horizon = (belowGroundLine: number): number =>
  VIEW_H * T.cameraVerticalAnchor + px(belowGroundLine);

/**
 * The camY at which a runner standing on the track's base row is at rest, so
 * the backdrop drifts from there rather than from an arbitrary world height.
 */
const BACKDROP_PIVOT = px(BASE_ROW * 16) - VIEW_H * T.cameraVerticalAnchor;

/**
 * Deterministic 0..1 from a column and a salt.
 *
 * Scenery has to come out identical on every phone from the level seed alone —
 * the same reason tile variants are hashed rather than random. A flower that is
 * in a different place on your screen and mine is a small thing; a flower that
 * moves while you watch it is a broken one.
 */
function scatterHash(tx: number, salt: number): number {
  let h = (Math.imul(tx, 374761393) + Math.imul(salt, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return ((Math.imul(h, 1274126177) ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Ground scenery, and the rule for what may be in it.
 *
 * Everything here is low, flat and unmistakably decorative. The tileset also has
 * crates, benches and a ladder, and none of them are here: a crate the runner
 * passes straight through is a lie about what terrain does, and the one thing
 * this game cannot afford is scenery that might be a platform. Those go in the
 * backdrop, behind the ground, where nothing is standable by convention.
 */
const SCATTER = ['tuft', 'tuft2', 'tuft3', 'tuft4', 'rock', 'rock2', 'fence', 'fence2'] as const;

/**
 * How solid a living rival looks.
 *
 * They are not solid — you run straight through them, and only a corpse is
 * ground — so a ghost must never read as something you could land on. It was
 * a quarter, which over this backdrop meant a rival's own nameplate was more
 * visible than the rival. Now that the tags do the identifying, this only has
 * to say "a person, not a platform", and it can afford to be seen doing it.
 */
const GHOST_ALPHA = 0.45;

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
    this.drawSky(world.level, camX, camY);
    this.mark('sky');
    if (THEME.art === 'atlas') {
      this.drawGrove(camX, camY);
    } else {
      this.drawTowers(this.farTowers, this.farBank, camX, camY, 0.2);
      this.drawTowers(this.nearTowers, this.nearBank, camX, camY, 0.45);
    }
    this.mark('towers');
    this.drawTiles(world, camX, camY);
    this.drawScatter(world.level, camX, camY);
    this.mark('tiles');
    this.drawCheckpoints(world, camX, camY);
    this.drawEnemies(world, camX, camY);
    this.drawGhosts(world, camX, camY);
    this.drawCorpses(world, camX, camY);
    this.drawPlayer(world, camX, camY);
    this.drawNameTags(world, camX, camY);
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

  /**
   * Sky, down to the deepest point anything can still show through.
   *
   * The full-buffer blit is the single most expensive draw in the frame, and
   * under a portrait viewport most of its lower half is immediately painted over
   * by deep earth. Every column needs sky only above its own earth line, so one
   * rect down to the deepest visible earth line satisfies all of them — and an
   * open column (a chasm, where earth never starts) pushes that to the floor,
   * which is correct: you can see all the way down a chasm.
   */
  private drawSky(level: Level, camX: number, camY: number): void {
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const tx1 = Math.min(level.w - 1, Math.ceil((camX + VIEW_W) / TILE));

    let bottom = 0;
    for (let tx = tx0; tx <= tx1; tx++) {
      const top = level.earthTop[tx] ?? -1;
      if (top < 0) {
        bottom = VIEW_H;
        break;
      }
      const y = top * TILE - camY;
      if (y > bottom) bottom = y;
    }
    const h = Math.min(VIEW_H, Math.max(0, Math.ceil(bottom)));
    if (h > 0) this.ctx.drawImage(this.sky, 0, 0, VIEW_W, h, 0, 0, VIEW_W, h);
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
    this.farTowers = towerRow(rng, levelWidth * 0.2, px(46), horizon(60), [px(30), px(96)], this.farBank.variants.length);
    this.nearTowers = towerRow(rng, levelWidth * 0.45, px(64), horizon(83), [px(24), px(70)], this.nearBank.variants.length);
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
    const oy = Math.round(clamp((camY - BACKDROP_PIVOT) * factor * 0.12, -px(20), px(20)));

    for (const t of towers) {
      const img = bank.get(t.variant);
      const x = t.x - ox;
      if (x + img.width < 0 || x > VIEW_W) continue;
      ctx.drawImage(img, x, t.y - oy);
    }
  }

  /**
   * Everything under the tiled crust, as one rect per run of equal-depth columns.
   *
   * Tiling down to the grid floor looks identical and costs ~250 extra draws a
   * frame — 11fps on a 4x throttle at a 25-tile viewport. Below the crust there
   * is nothing to read: no edges, no variation, nothing standable. Flood it.
   */
  private drawDeepEarth(level: Level, tx0: number, tx1: number, camX: number, camY: number): void {
    const ctx = this.ctx;

    // A repeating pattern, not a flat colour — and pinned to the world grid, or
    // it swims against the terrain sitting on top of it. The context is shifted
    // by the camera's offset within one tile and every rect shifted back, so the
    // pattern scrolls with the ground while the rects stay where they were.
    const atlasTiles = this.tiles instanceof AtlasTiles ? this.tiles : null;
    const ox = -(camX % TILE);
    const oy = -(camY % TILE);
    ctx.save();
    if (atlasTiles !== null) {
      ctx.translate(ox, oy);
      ctx.fillStyle = atlasTiles.deepFill;
    } else {
      ctx.fillStyle = this.tiles.deepColor;
    }
    const sx = atlasTiles !== null ? ox : 0;
    const sy = atlasTiles !== null ? oy : 0;

    let runStart = -1;
    let runTop = 0;
    const flush = (endTx: number): void => {
      if (runStart < 0) return;
      const y = runTop * TILE - camY;
      if (y < VIEW_H) {
        ctx.fillRect(runStart * TILE - camX - sx, y - sy, (endTx - runStart + 1) * TILE, VIEW_H - y);
      }
      runStart = -1;
    };

    for (let tx = tx0; tx <= tx1; tx++) {
      const top = level.earthTop[tx] ?? -1;
      if (top < 0) {
        flush(tx - 1);
      } else if (runStart < 0) {
        runStart = tx;
        runTop = top;
      } else if (top !== runTop) {
        flush(tx - 1);
        runStart = tx;
        runTop = top;
      }
    }
    flush(tx1);
    ctx.restore();
  }

  /**
   * Tufts, stones and fencing along the surface.
   *
   * Placed from the column index, so the same track grows the same scenery on
   * every phone, and only where the column's top tile is flat solid ground —
   * never on a slope, a spike or a breakable, where a decoration would sit at a
   * angle or, worse, soften something that is about to kill you.
   */
  private drawScatter(level: Level, camX: number, camY: number): void {
    if (!(this.tiles instanceof AtlasTiles)) return;
    const ctx = this.ctx;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const tx1 = Math.min(level.w - 1, Math.ceil((camX + VIEW_W) / TILE));

    for (let tx = tx0; tx <= tx1; tx++) {
      const surface = level.surfaceTop[tx] ?? -1;
      if (surface < 0) continue;
      // Roughly one column in three, so the ground is dressed rather than
      // carpeted — scenery on every tile is as monotonous as none at all.
      const roll = scatterHash(tx, 17);
      if (roll > 0.34) continue;

      const key = SCATTER[Math.floor(scatterHash(tx, 43) * SCATTER.length)] ?? SCATTER[0];
      const img = this.tiles.prop(key, 1);
      const y = surface * TILE - camY - img.height;
      if (y > VIEW_H || y + img.height < 0) continue;
      // Nudged within the tile so a run of props doesn't line up on the grid.
      const jitter = Math.round(scatterHash(tx, 71) * (TILE - img.width));
      ctx.drawImage(img, Math.round(tx * TILE - camX + jitter), Math.round(y));
    }
  }

  private drawTiles(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    const level = world.level;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const tx1 = Math.min(level.w - 1, Math.ceil((camX + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const ty1 = Math.min(level.h - 1, Math.ceil((camY + VIEW_H) / TILE));

    this.drawDeepEarth(level, tx0, tx1, camX, camY);

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
              ctx.drawImage(
                this.tiles.faced_(exposed ? 'top' : 'deep', faces, scatterHash(tx, 91) < 0.5 ? 0 : 1),
                x,
                y,
              );
              // An overhang needs a bottom. Air below only counts as visible if
              // it sits above this column's flood line — below that the bedrock
              // fill covers it, and every column ends in air down there.
              const earth = level.earthTop[tx] ?? -1;
              if (level.get(tx, ty + 1) === Tile.Empty && (earth < 0 || ty + 1 < earth)) {
                ctx.drawImage(this.tiles.underside, x, y);
              }
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
      // Wrapped, not merely offset. At 0.04 parallax the moon slid off the left
      // edge about four thousand pixels into a track and never came back, so
      // most of a run had an empty sky. Wrapping gives it back periodically.
      const span = VIEW_W + moon[2];
      const drift = (((VIEW_W * 0.74 - camX * 0.04) % span) + span) % span;
      // Clear of the HUD, which owns the top two rows.
      drawFrame(ctx, 'moon0', drift - moon[2], px(52) - camY * 0.03);
    }
    if (frameRect('tree') === undefined) return;

    // Scaled up with the taller portrait viewport: the canopies are what fill
    // the sky, and at the old sizes they topped out a third of the way down and
    // left a bare band above.
    // Scaled up with the zoom, but only so far. At 1.95 a single trunk filled a
    // third of the frame and read as something you could stand on — which is the
    // background-becomes-floor confusion the palette rules exist to prevent, and
    // a worse failure than an empty sky. Distant silhouettes, not scenery.
    // The hedge was tried as a third, nearest layer and taken straight back out:
    // it is a closed ring of foliage, not a silhouette, so at the ground line it
    // read as a solid bush sitting ON the platform rather than behind it — the
    // exact background-as-foreground confusion these layers exist to avoid.
    for (const layer of [
      { key: 'tree', factor: 0.22, spacing: px(140), alpha: 0.72, scale: 1.15, base: horizon(71) },
      { key: 'tree', factor: 0.45, spacing: px(184), alpha: 1, scale: 1.5, base: horizon(95) },
    ]) {
      if (frameRect(layer.key) === undefined) continue;
      const img = (this.tiles as AtlasTiles).prop(layer.key, layer.scale);
      const ox = camX * layer.factor;
      const oy = clamp((camY - BACKDROP_PIVOT) * layer.factor * 0.12, -px(20), px(20));
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

  /**
   * Rivals, at a quarter opacity and with no outline.
   *
   * Opacity means solidity, absolutely: a corpse is opaque and bright-edged
   * because you can stand on it, and a living rival is faint because you cannot.
   * On a small screen with eleven of them on it, any ambiguity about what holds
   * your weight is fatal, so they are drawn before corpses and never over them.
   */
  private drawGhosts(world: World, camX: number, camY: number): void {
    if (world.ghosts.length === 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = GHOST_ALPHA;
    for (const g of world.ghosts) {
      const x = g.x - camX;
      if (x < -px(40) || x > VIEW_W + px(40)) continue;
      const name: SpriteName =
        g.state === 'slide' ? 'slide' : g.state === 'air' ? 'fall' : RUN_CYCLE[0]!;
      this.sprites.draw(ctx, name, x, g.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Who is who, over their heads.
   *
   * A ghost is drawn at a quarter alpha, which is right for something you run
   * straight through and wrong for something you are meant to recognise. The
   * tag carries the recognition instead — full strength, and inked in the
   * shirt colour that player picked, so the name and the runner under it are
   * saying the same thing. Twelve outfits chosen so no two share a dominant
   * colour only pays off if the colour is attached to a name.
   *
   * Drawn after the runners rather than with them, so a tag is never behind
   * somebody else's body.
   */
  private drawNameTags(world: World, camX: number, camY: number): void {
    const ctx = this.ctx;
    if (world.me === null && world.ghosts.length === 0) return;

    const w = world.player.w;
    ctx.font = `bold ${px(5)}px monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    interface Tag {
      key: string;
      x: number;
      y: number;
      label: string;
      tw: number;
      kit: number;
      own: boolean;
    }
    const tags: Tag[] = [];

    const consider = (
      key: string,
      wx: number,
      wy: number,
      raw: string,
      kit: number,
      own: boolean,
    ): void => {
      if (raw.length === 0) return;
      const cx = wx + w / 2 - camX;
      // Off-screen runners get no tag at all. Clamping one to the edge instead
      // would leave a name parked at the side of the screen with nobody under
      // it, which reads as a player standing still rather than a player gone.
      if (cx < -px(8) || cx > VIEW_W + px(8)) return;
      const y = Math.round(wy - camY - px(9));
      if (y < -px(8) || y > VIEW_H) return;

      const label = raw.toUpperCase();
      const tw = ctx.measureText(label).width;
      // Only the overhang is pulled in, so a long name at the screen edge stays
      // readable while a tag in open ground still sits centred on its owner.
      tags.push({
        key,
        x: Math.round(clamp(cx, tw / 2 + px(2), VIEW_W - tw / 2 - px(2))),
        y,
        label,
        tw,
        kit,
        own,
      });
    };

    for (const g of world.ghosts) consider(g.id, g.x, g.y, g.name, g.kit, false);
    if (world.me !== null && world.player.alive) {
      consider('', world.player.x, world.player.y, world.me.name, world.me.kit, true);
    }
    if (tags.length === 0) {
      ctx.textAlign = 'left';
      return;
    }

    /**
     * Stack tags that would otherwise sit on top of each other.
     *
     * Everyone starts on the same tile, so the crowded case is not an edge
     * case — it is the first two seconds of every race, and three overlapping
     * names are less use than none. Each tag takes the lowest free row above
     * its owner's head.
     *
     * Rows are handed out in id order rather than by position, so a tag keeps
     * its row while two runners jostle past each other instead of flickering
     * between rows every time they swap places.
     */
    const ROWS = 4;
    const rows: { left: number; right: number }[][] = [];
    tags.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    for (const t of tags) {
      const left = t.x - t.tw / 2 - px(3);
      const right = t.x + t.tw / 2 + px(3);
      let row = 0;
      while (row < ROWS - 1) {
        const taken = rows[row];
        if (taken === undefined || !taken.some((s) => left < s.right && right > s.left)) break;
        row += 1;
      }
      (rows[row] ??= []).push({ left, right });

      const y = t.y - row * px(8);
      ctx.globalAlpha = t.own ? 0.75 : 1;
      ctx.fillStyle = P.hudBack;
      ctx.fillRect(Math.round(t.x - t.tw / 2 - px(2)), y - px(1), Math.round(t.tw + px(4)), px(7));
      const combo = KIT_COMBOS[t.kit] ?? KIT_COMBOS[0]!;
      ctx.fillStyle = KITS[combo.shirt]!.color;
      ctx.fillText(t.label, t.x, y);
    }
    ctx.globalAlpha = 1;

    // The HUD draws left-aligned and inherits this context.
    ctx.textAlign = 'left';
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
