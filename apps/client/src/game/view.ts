/**
 * Internal resolution. Everything is authored and simulated in these pixels,
 * then integer-scaled to fill the screen.
 *
 * 480x270 is the balance point: chunky enough to read on a phone, wide enough
 * to give reaction time at speed. 320x180 looks better and cuts your
 * look-ahead, which is dangerous in a reaction-based runner.
 */
export const VIEW_W = 480;
export const VIEW_H = 270;
