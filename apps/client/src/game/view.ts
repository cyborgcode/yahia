import { px } from './scale';

/**
 * Internal resolution, derived from SCALE.
 *
 * The viewport is a fixed tile count — 14 across — and that count is the same on
 * every device and in both orientations. Every player sees exactly the same
 * amount of track ahead, which in a race is a fairness property rather than a
 * preference. Scale buys detail, never reach.
 *
 * It was 30 across when the game was landscape, then 20 when it went portrait.
 * 20 was still too far away: at 390 CSS pixels of phone that is a 19px tile and
 * a runner 14px wide, which is a character you can lose track of on the thing
 * you are supposed to be watching. 14 across is a 28px tile — 43% bigger — and
 * that is the whole reason for this number.
 *
 * Zooming in is paid for in look-ahead, which is the one thing a runner cannot
 * be short of, so it is not free and should not go much further: at 14 tiles the
 * warning at top speed is ~0.86s against roughly 0.4s of touch latency and
 * reaction. `cameraAnchor` is what buys some of it back.
 */
const TILES_ACROSS = 14;

export const VIEW_W = px(16 * TILES_ACROSS);

/**
 * Tall enough to fill a phone rather than sit in a letterbox.
 *
 * 224x486 is 1:2.17, which is a modern phone almost exactly, so the canvas
 * reaches all four edges on the devices this is built for and only bars on the
 * squarer ones. Fixed rather than derived from the actual screen: a per-device
 * height would give some players more warning of a drop than others, and the
 * whole point of a fixed field of view is that nobody gets that.
 *
 * It also has to stay inside the level, which is 40 tiles tall. 486 is 30 of
 * them, leaving the camera room to move.
 */
export const VIEW_H = px(486);
