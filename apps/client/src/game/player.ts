import type { Level } from './level';
import {
  groundAt,
  hasHeadroom,
  resolveCeiling,
  resolveHorizontal,
  touchesDeadly,
  type Box,
  type Corpse,
  type GroundHit,
} from './physics';
import { Tile, clamp } from './tiles';
import { T } from './tuning';

export const PLAYER_W = 12;
export const PLAYER_H_STAND = 20;
export const PLAYER_H_SLIDE = 10;

/** Speed you can never drop below — this is an auto-runner, not a walk. */
const FLOOR_SPEED = 55;

export interface PlayerInput {
  jumpHeld: boolean;
  /** True only on the frame the press happened. */
  jumpPressed: boolean;
  slideHeld: boolean;
}

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  readonly w = PLAYER_W;
  h = PLAYER_H_STAND;

  grounded = false;
  sliding = false;
  alive = true;
  finished = false;

  /** Set while airborne with slide held past the apex — a committed fast-fall. */
  fastFalling = false;

  private slideMs = 0;
  private coyoteMs = 0;
  private bufferMs = 0;
  private jumpCutDone = true;
  private groundSlope = 0;

  /** Breakable tile currently underfoot, for the world to light a fuse on. */
  standingOnBreakable: { tx: number; ty: number } | null = null;

  spawn(x: number, y: number): void {
    if (this.sliding) this.stopSlideRaw();
    this.x = x;
    this.y = y - this.h;
    this.vx = T.baseSpeed * 0.7;
    this.vy = 0;
    this.grounded = false;
    this.alive = true;
    this.finished = false;
    this.fastFalling = false;
    this.slideMs = 0;
    this.coyoteMs = 0;
    this.bufferMs = 0;
    this.jumpCutDone = true;
    this.groundSlope = 0;
  }

  box(): Box {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, input: PlayerInput, level: Level, corpses: readonly Corpse[]): void {
    if (!this.alive || this.finished) return;
    const ms = dt * 1000;

    // --- input grace windows ------------------------------------------------
    this.bufferMs = input.jumpPressed ? T.bufferMs : Math.max(0, this.bufferMs - ms);
    this.coyoteMs = this.grounded ? T.coyoteMs : Math.max(0, this.coyoteMs - ms);
    this.slideMs += ms;

    // --- slide state --------------------------------------------------------
    if (input.slideHeld && !this.sliding) {
      this.startSlide();
    } else if (!input.slideHeld && this.sliding && this.slideMs >= T.slideMinMs) {
      const extra = PLAYER_H_STAND - PLAYER_H_SLIDE;
      if (hasHeadroom(level, corpses, this.box(), extra)) this.stopSlideRaw();
    }

    // --- jump ---------------------------------------------------------------
    if (this.bufferMs > 0 && (this.grounded || this.coyoteMs > 0)) {
      const isSlideJump = this.sliding;
      // Slide-jumps trade height for length: lower arc, extra speed.
      this.vy = -(isSlideJump ? T.jumpVel * T.slideJumpVelMul : T.jumpVel);
      if (isSlideJump) this.vx += T.slideJumpSpeedBonus;
      this.bufferMs = 0;
      this.coyoteMs = 0;
      this.grounded = false;
      this.jumpCutDone = false;
    }

    // Releasing early cuts the rise — variable jump height.
    if (this.vy < 0 && !input.jumpHeld && !this.jumpCutDone) {
      this.vy *= T.jumpCutMul;
      this.jumpCutDone = true;
    }

    // --- horizontal: the momentum model ------------------------------------
    let ax: number;
    if (this.grounded) {
      const s = this.groundSlope;
      if (this.sliding) {
        // Sliding is the speed engine downhill and a tax everywhere else.
        if (s < 0) ax = T.slopeAccel * T.slideSlopeMul;
        else if (s > 0) ax = -T.slopeDecel;
        else ax = -T.slideFrictionFlat;
      } else {
        ax = s < 0 ? T.slopeAccel * 0.5 : s > 0 ? -T.slopeDecel * 0.6 : 0;
        ax += this.vx < T.baseSpeed ? T.accel : -T.overspeedDrag;
      }
    } else {
      ax = this.vx < T.baseSpeed ? T.accel * 0.35 : -T.overspeedDrag * 0.5;
    }
    this.vx = clamp(this.vx + ax * dt, FLOOR_SPEED, T.maxSpeed);

    // --- vertical -----------------------------------------------------------
    this.fastFalling = !this.grounded && input.slideHeld && this.vy > 0;
    this.vy += T.gravity * (this.fastFalling ? T.fastFallMul : 1) * dt;
    const maxFall = T.maxFallSpeed * (this.fastFalling ? 1.6 : 1);
    if (this.vy > maxFall) this.vy = maxFall;

    // --- integrate & collide ------------------------------------------------
    const wasGrounded = this.grounded;

    this.x += this.vx * dt;
    const push = resolveHorizontal(level, corpses, this.box(), 1);
    if (push !== null) {
      this.x = push;
      this.vx *= 0.35; // clipping a wall costs you the run you'd banked
    }

    this.y += this.vy * dt;
    if (this.vy < 0) {
      const ceiling = resolveCeiling(level, corpses, this.box());
      if (ceiling !== null) {
        this.y = ceiling;
        this.vy = 0;
      }
    }

    this.grounded = false;
    this.standingOnBreakable = null;
    if (this.vy >= 0) {
      const feet = this.y + this.h;
      const snapUp = wasGrounded ? 10 : 6;
      const snapDown = wasGrounded ? 12 : 0; // stick to descending slopes
      let best: GroundHit | null = null;
      for (const sx of [this.x + 2, this.x + this.w / 2, this.x + this.w - 2]) {
        const hit = groundAt(level, corpses, sx, feet, snapUp, snapDown);
        if (hit !== null && (best === null || hit.y < best.y)) best = hit;
      }
      if (best !== null) {
        this.y = best.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.groundSlope = best.slope;
        if (best.tile === Tile.Breakable && best.tx >= 0) {
          this.standingOnBreakable = { tx: best.tx, ty: best.ty };
        }
      }
    }

    // --- outcomes -----------------------------------------------------------
    if (touchesDeadly(level, this.box()) || this.y > level.pxHeight) {
      this.alive = false;
    } else if (level.goalX > 0 && this.x >= level.goalX) {
      this.finished = true;
    }
  }

  private startSlide(): void {
    this.y += PLAYER_H_STAND - PLAYER_H_SLIDE;
    this.h = PLAYER_H_SLIDE;
    this.sliding = true;
    this.slideMs = 0;
    if (this.grounded) this.vx += T.slideBoost;
  }

  private stopSlideRaw(): void {
    if (!this.sliding) return;
    this.y -= PLAYER_H_STAND - PLAYER_H_SLIDE;
    this.h = PLAYER_H_STAND;
    this.sliding = false;
  }
}
