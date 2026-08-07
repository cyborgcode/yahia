import { px } from './scale';

/**
 * Internal resolution, derived from SCALE.
 *
 * The field of view is fixed at 30 tiles across regardless of scale — every
 * player sees exactly the same amount of track ahead, which in a race is a
 * fairness property rather than a preference. Scale buys detail, never reach.
 */
export const VIEW_W = px(480);
export const VIEW_H = px(270);
