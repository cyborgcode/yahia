/**
 * The one number the whole render scale derives from.
 *
 * Everything — tile size, viewport, hitboxes, gravity, HUD type — is authored
 * against a 480x270 / 16px-tile base and multiplied by SCALE. Changing this
 * line changes the game's resolution coherently, which is the only sane way to
 * tune a mobile game whose floor device matters more than its ceiling.
 *
 * Why 3 (1440x810, 48px tiles) rather than 4:
 *
 *   Landscape phones, device pixels available against a 16:9 buffer:
 *     flagship   ~1179 tall   810 upscales 1.46x   sharp
 *     mid-range  ~1017 tall   810 upscales 1.26x   sharp
 *     budget      ~720 tall   810 downscales 0.89x  21% wasted
 *
 *   At SCALE 4 that last row rendered 1080 rows into a 720-row screen and threw
 *   away 56% of the pixels it had just paid for, while a 4x CPU throttle put
 *   frame rate at 34fps. Fill cost here is 1.17 Mpx against 2.07 Mpx — 44% less
 *   — for detail nearly every phone can still resolve.
 *
 * The field of view is unaffected: 30 tiles across at every scale, so no player
 * ever sees more of the track than another. In a race that is a fairness
 * property, not a preference.
 */
export const SCALE = 3;

/** Base-unit helper: `px(900)` is 900 pixels at the 480x270 authoring scale. */
export function px(base: number): number {
  return base * SCALE;
}
