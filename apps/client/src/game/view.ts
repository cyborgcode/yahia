import { px } from './scale';

/**
 * Internal resolution, derived from SCALE.
 *
 * The viewport is a fixed tile count — 20 across, ~17 down — and that count is
 * the same in both orientations. Every player sees exactly the same amount of
 * track ahead, which in a race is a fairness property rather than a preference.
 * Scale buys detail, never reach.
 *
 * It used to be 30 across, which was a landscape number. Portrait cannot carry
 * 30 tiles: a phone held upright is ~2.17 times taller than it is wide, so
 * holding the horizontal tile count and letting the vertical follow the device
 * aspect — the escape hatch DESIGN.md reserved — would ask for 65 tiles of
 * height out of a level that is only 40 tall. You would be looking at void.
 *
 * So the horizontal count comes down instead, and the vertical stays where it
 * was. 20x17 is close enough to square (1.19:1) that it fills a portrait phone
 * edge to edge and still fits a landscape one pillarboxed, which is why the
 * rotate-your-phone gate is gone: both orientations play, and they play the
 * same. Narrowing costs look-ahead, and `cameraAnchor` pays it back.
 */
const TILES_ACROSS = 20;

export const VIEW_W = px(16 * TILES_ACROSS);

/**
 * 25 tiles down. Taller than the 270 the landscape build used, for two reasons
 * that both come from holding the phone upright: a 20x17 window filled only a
 * third of a portrait screen and left the rest dead, and the corpse staircase —
 * the whole mechanic — climbs vertically and was running off the top of frame.
 */
export const VIEW_H = px(400);
