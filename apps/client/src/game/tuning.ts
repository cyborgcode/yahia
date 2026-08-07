import { px } from './scale';

/**
 * Every number that decides how YAHIA feels.
 *
 * This object is mutated live by the tuner overlay (press `T`), which is the
 * entire point of the prototype: find the values, then freeze them.
 *
 * Distances are authored once at the 480x270 base and multiplied by SCALE.
 * Lengths scale with the render scale and time does not — so velocities (px/s)
 * and accelerations (px/s²) scale, while every duration in milliseconds is a
 * bare number that must never be touched by a resolution change.
 */
export const T = {
  // --- gravity -------------------------------------------------------------
  gravity: px(900),
  /** Air-slide (fast-fall) multiplies gravity. Commit downward, hard. */
  fastFallMul: 2.4,
  maxFallSpeed: px(420),

  // --- run -----------------------------------------------------------------
  /** The speed you drift back to. Everything above this is earned. */
  baseSpeed: px(150),
  maxSpeed: px(300),
  /** Acceleration back up to baseSpeed when below it. */
  accel: px(420),
  /** How fast banked speed bleeds off on flat ground. */
  overspeedDrag: px(55),

  // --- jump ----------------------------------------------------------------
  jumpVel: px(300),
  /** Releasing early cuts upward velocity by this factor (variable height). */
  jumpCutMul: 0.4,
  /** Grace period to still jump after walking off a ledge. */
  coyoteMs: 100,
  /** Grace period for a jump pressed slightly before landing. */
  bufferMs: 120,

  // --- slide ---------------------------------------------------------------
  /** Instant speed kick when the slide starts. */
  slideBoost: px(45),
  /** Slides bleed speed on flat ground — using it wrong costs you. */
  slideFrictionFlat: px(210),
  /** Minimum slide duration. Slides are a commitment, not a tap. */
  slideMinMs: 160,
  /** Slide-jumps go lower... */
  slideJumpVelMul: 0.8,
  /** ...but carry extra speed. Long and flat instead of high. */
  slideJumpSpeedBonus: px(34),

  // --- slopes --------------------------------------------------------------
  /** Along-slope acceleration while descending. */
  slopeAccel: px(520),
  /** Along-slope deceleration while climbing. */
  slopeDecel: px(400),
  /** Sliding down a slope multiplies the gain. This is the speed engine. */
  slideSlopeMul: 1.7,

  // --- corpses -------------------------------------------------------------
  corpseLifeMs: 15000,
  /** Outline pulses for this long before a corpse vanishes. Fairness. */
  corpseWarnMs: 3000,
  /** Global cap; oldest evicted first so the level never turns into soup. */
  corpseCap: 60,

  // --- death ---------------------------------------------------------------
  respawnDelayMs: 900,

  // --- camera --------------------------------------------------------------
  /** Player's resting position across the viewport, 0..1 from the left. */
  cameraAnchor: 0.28,
  /** Extra look-ahead at max speed, in pixels. */
  cameraLookAhead: px(64),
  cameraSmooth: 9,
};

export type Tuning = typeof T;

/** Ranges for the live tuner overlay. Only listed keys get a slider. */
export const TUNER_RANGES: Partial<Record<keyof Tuning, [number, number]>> = {
  gravity: [px(400), px(2000)],
  fastFallMul: [1, 5],
  baseSpeed: [px(80), px(300)],
  maxSpeed: [px(150), px(500)],
  accel: [px(100), px(1200)],
  overspeedDrag: [0, px(300)],
  jumpVel: [px(150), px(500)],
  jumpCutMul: [0, 1],
  coyoteMs: [0, 250],
  bufferMs: [0, 300],
  slideBoost: [0, px(150)],
  slideFrictionFlat: [0, px(600)],
  slideMinMs: [0, 500],
  slideJumpVelMul: [0.3, 1.2],
  slideJumpSpeedBonus: [0, px(120)],
  slopeAccel: [0, px(1200)],
  slopeDecel: [0, px(1200)],
  slideSlopeMul: [1, 3],
  cameraAnchor: [0.1, 0.6],
  cameraLookAhead: [0, px(160)],
};
