/**
 * Internal resolution. Everything is authored and simulated in these pixels,
 * then scaled to fill the screen.
 *
 * 1920x1080, doubled twice from the original 480x270. Each doubling deliberately
 * keeps the *field of view* identical — 30 tiles across, same look-ahead, same
 * reaction time — and spends every new pixel on detail instead. Widening the
 * view would have quietly made the game easier; this only makes it sharper.
 */
export const VIEW_W = 1920;
export const VIEW_H = 1080;
