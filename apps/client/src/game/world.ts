import type { Input } from '../core/input';
import { buildLevel, type Checkpoint, type Level } from './level';
import type { Corpse } from './physics';
import { Player } from './player';
import { TILE, Tile, clamp } from './tiles';
import { T } from './tuning';
import { VIEW_H, VIEW_W } from './view';

/** How long a breakable floor holds once someone stands on it. */
const BREAK_FUSE_MS = 260;

/**
 * Bodies lie flat, whatever killed you.
 *
 * A corpse the width of the runner is ~80ms of platform at speed — too small
 * to land on deliberately, which kills the whole staircase mechanic. Laying it
 * down makes it a usable ledge and reads instantly as a fallen body.
 */
const CORPSE_W = 20;
const CORPSE_H = 10;

export class World {
  level: Level;
  readonly player = new Player();
  corpses: Corpse[] = [];

  camX = 0;
  camY = 0;
  timeMs = 0;
  deaths = 0;
  topSpeed = 0;
  seed: number;

  /** Distinct corpses this run has been supported by — the martyr mechanic. */
  readonly corpsesUsed = new Set<Corpse>();
  lastDeathAt = '—';
  finishedMs: number | null = null;

  private respawnMs = 0;
  private checkpoint: Checkpoint;
  private fuses = new Map<number, number>();

  constructor(seed: number) {
    this.seed = seed;
    this.level = buildLevel(seed);
    this.checkpoint = this.level.checkpoints[0] ?? { x: 32, y: 22 * TILE };
    this.player.spawn(this.checkpoint.x, this.checkpoint.y);
    this.snapCamera();
  }

  reset(seed = this.seed): void {
    this.seed = seed;
    this.level = buildLevel(seed);
    this.corpses = [];
    this.corpsesUsed.clear();
    this.fuses.clear();
    this.timeMs = 0;
    this.deaths = 0;
    this.topSpeed = 0;
    this.respawnMs = 0;
    this.finishedMs = null;
    this.lastDeathAt = '—';
    this.checkpoint = this.level.checkpoints[0] ?? { x: 32, y: 22 * TILE };
    this.player.spawn(this.checkpoint.x, this.checkpoint.y);
    this.snapCamera();
  }

  step(dt: number, input: Input): void {
    const ms = dt * 1000;
    if (this.finishedMs === null) this.timeMs += ms;

    this.decayCorpses();
    this.tickFuses(ms);

    if (this.player.alive) {
      this.player.update(
        dt,
        {
          jumpHeld: input.jumpHeld,
          jumpPressed: input.consumeJumpPressed(),
          slideHeld: input.slideHeld,
        },
        this.level,
        this.corpses,
      );

      this.topSpeed = Math.max(this.topSpeed, this.player.vx);
      this.advanceCheckpoint();
      this.creditCorpseSupport();
      this.lightFuse();

      if (this.player.finished && this.finishedMs === null) this.finishedMs = this.timeMs;
      if (!this.player.alive) this.onDeath();
    } else {
      this.respawnMs -= ms;
      if (this.respawnMs <= 0) this.player.spawn(this.checkpoint.x, this.checkpoint.y);
    }

    this.updateCamera(dt);
  }

  /** Death leaves the body exactly where it fell — including mid-air. */
  private onDeath(): void {
    const p = this.player;
    this.deaths++;
    this.lastDeathAt = this.level.segmentNameAt(p.x);
    this.respawnMs = T.respawnDelayMs;
    this.corpses.push({
      x: Math.round(p.x + p.w / 2 - CORPSE_W / 2),
      y: Math.round(p.y + p.h - CORPSE_H),
      w: CORPSE_W,
      h: CORPSE_H,
      born: this.timeMs,
      where: this.lastDeathAt,
    });
    while (this.corpses.length > T.corpseCap) this.corpses.shift();
  }

  private decayCorpses(): void {
    if (this.corpses.length === 0) return;
    this.corpses = this.corpses.filter((c) => this.timeMs - c.born < T.corpseLifeMs);
  }

  private advanceCheckpoint(): void {
    for (const cp of this.level.checkpoints) {
      if (cp.x <= this.player.x && cp.x > this.checkpoint.x) this.checkpoint = cp;
    }
  }

  private creditCorpseSupport(): void {
    if (!this.player.grounded) return;
    const feet = this.player.y + this.player.h;
    for (const c of this.corpses) {
      if (Math.abs(c.y - feet) > 2) continue;
      if (this.player.x + this.player.w < c.x || this.player.x > c.x + c.w) continue;
      this.corpsesUsed.add(c);
    }
  }

  private lightFuse(): void {
    const b = this.player.standingOnBreakable;
    if (b === null) return;
    const key = b.ty * this.level.w + b.tx;
    if (!this.fuses.has(key)) this.fuses.set(key, BREAK_FUSE_MS);
  }

  private tickFuses(ms: number): void {
    if (this.fuses.size === 0) return;
    for (const [key, left] of this.fuses) {
      const next = left - ms;
      if (next > 0) {
        this.fuses.set(key, next);
        continue;
      }
      this.fuses.delete(key);
      const ty = Math.floor(key / this.level.w);
      const tx = key % this.level.w;
      this.level.set(tx, ty, Tile.Empty);
    }
  }

  /** Fuse progress 0..1 for rendering, or null if the tile isn't lit. */
  fuseAt(tx: number, ty: number): number | null {
    const left = this.fuses.get(ty * this.level.w + tx);
    return left === undefined ? null : 1 - left / BREAK_FUSE_MS;
  }

  private updateCamera(dt: number): void {
    const [tx, ty] = this.cameraTarget();
    const k = Math.min(1, T.cameraSmooth * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k * 0.7;
    this.clampCamera();
  }

  private snapCamera(): void {
    const [tx, ty] = this.cameraTarget();
    this.camX = tx;
    this.camY = ty;
    this.clampCamera();
  }

  private cameraTarget(): [number, number] {
    // Going fast buys you less reaction time, so look further ahead.
    const speedT = clamp(
      (this.player.vx - T.baseSpeed) / Math.max(1, T.maxSpeed - T.baseSpeed),
      0,
      1,
    );
    const x = this.player.x - VIEW_W * T.cameraAnchor + speedT * T.cameraLookAhead;
    const y = this.player.y + this.player.h / 2 - VIEW_H / 2;
    return [x, y];
  }

  private clampCamera(): void {
    this.camX = clamp(this.camX, 0, Math.max(0, this.level.pxWidth - VIEW_W));
    this.camY = clamp(this.camY, 0, Math.max(0, this.level.pxHeight - VIEW_H));
  }
}
