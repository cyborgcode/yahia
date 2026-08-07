/**
 * Every number that decides how YAHIA feels.
 *
 * This object is mutated live by the tuner overlay (press `T`), which is the
 * entire point of the prototype: find the values, then freeze them.
 * Units are pixels and seconds, in the 1920x1080 internal resolution.
 *
 * These are the 480x270 values doubled twice. Lengths scale linearly with the render
 * scale and time does not, so velocities (px/s) and accelerations (px/s²) both
 * double while every duration in milliseconds stays exactly where it was.
 */
export const T = {
  // --- gravity -------------------------------------------------------------
  gravity: 3600,
  /** Air-slide (fast-fall) multiplies gravity. Commit downward, hard. */
  fastFallMul: 2.4,
  maxFallSpeed: 1680,

  // --- run -----------------------------------------------------------------
  /** The speed you drift back to. Everything above this is earned. */
  baseSpeed: 600,
  maxSpeed: 1200,
  /** Acceleration back up to baseSpeed when below it. */
  accel: 1680,
  /** How fast banked speed bleeds off on flat ground. */
  overspeedDrag: 220,

  // --- jump ----------------------------------------------------------------
  jumpVel: 1200,
  /** Releasing early cuts upward velocity by this factor (variable height). */
  jumpCutMul: 0.4,
  /** Grace period to still jump after walking off a ledge. */
  coyoteMs: 100,
  /** Grace period for a jump pressed slightly before landing. */
  bufferMs: 120,

  // --- slide ---------------------------------------------------------------
  /** Instant speed kick when the slide starts. */
  slideBoost: 180,
  /** Slides bleed speed on flat ground — using it wrong costs you. */
  slideFrictionFlat: 840,
  /** Minimum slide duration. Slides are a commitment, not a tap. */
  slideMinMs: 160,
  /** Slide-jumps go lower... */
  slideJumpVelMul: 0.8,
  /** ...but carry extra speed. Long and flat instead of high. */
  slideJumpSpeedBonus: 136,

  // --- slopes --------------------------------------------------------------
  /** Along-slope acceleration while descending. */
  slopeAccel: 2080,
  /** Along-slope deceleration while climbing. */
  slopeDecel: 1600,
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
  cameraLookAhead: 256,
  cameraSmooth: 9,
};

export type Tuning = typeof T;

/** Ranges for the live tuner overlay. Only listed keys get a slider. */
export const TUNER_RANGES: Partial<Record<keyof Tuning, [number, number]>> = {
  gravity: [1600, 8000],
  fastFallMul: [1, 5],
  baseSpeed: [320, 1200],
  maxSpeed: [600, 2000],
  accel: [400, 4800],
  overspeedDrag: [0, 1200],
  jumpVel: [600, 2000],
  jumpCutMul: [0, 1],
  coyoteMs: [0, 250],
  bufferMs: [0, 300],
  slideBoost: [0, 600],
  slideFrictionFlat: [0, 2400],
  slideMinMs: [0, 500],
  slideJumpVelMul: [0.3, 1.2],
  slideJumpSpeedBonus: [0, 480],
  slopeAccel: [0, 4800],
  slopeDecel: [0, 4800],
  slideSlopeMul: [1, 3],
  cameraAnchor: [0.1, 0.6],
  cameraLookAhead: [0, 640],
};
