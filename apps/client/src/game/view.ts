import { px } from './scale';

/**
 * Internal resolution, derived from SCALE.
 *
 * The field of view is a fixed tile count ACROSS — 12 — on every device and in
 * both orientations. No player may ever see further ahead than another, which in
 * a race is a fairness requirement rather than a preference. Scale buys detail,
 * never reach.
 *
 * It was 30 across when the game was landscape, then 20, 14, 12. At 390 CSS
 * pixels of phone, 10 is a 39px tile and a runner 29px wide — two and a half
 * times the size he was in the first portrait build.
 *
 * Zooming in is paid for in look-ahead, and the payment cannot be avoided: the
 * most track that can ever be ahead of the runner is the viewport minus where
 * he stands in it. 30 tiles gave 1.37s of warning at top speed; 10 gives 0.46s,
 * against roughly 0.35s of touch latency and reaction. That is thin on purpose
 * — the speed model is meant to trade reaction time for pace — but it is close
 * enough to the floor that the next step down should be felt on a real phone
 * before it is taken, not reasoned about here.
 */
const TILES_ACROSS = 10;

export const VIEW_W = px(16 * TILES_ACROSS);

/**
 * The height is the DEVICE's, not a number chosen here.
 *
 * A fixed buffer can only match one screen shape. Held upright, phones run from
 * about 1:1.78 (an SE) to 1:2.22 (a 20:9 Android), and a buffer cut for the tall
 * end letterboxes the short end badly — bars down both sides of a game that is
 * meant to fill the phone. So the width stays a fixed tile count, which is the
 * half that has to be fair, and the height follows whatever screen it lands on.
 *
 * The trade is that vertical field of view now varies between devices. That is
 * the right thing to give up: this is a horizontal race, so what one player can
 * see of the track ahead is a fairness question and how much sky sits above them
 * is not.
 *
 * Measured against the SAFE box, not the raw window — the notch and the home
 * indicator are padding on #stage, so fitting the window would fit a rectangle
 * the canvas is never allowed to use, and put the bars back.
 */
/**
 * The floor exists for landscape, not for portrait. Turned on its side a phone
 * asks for a 5-tile-tall window, which is not a view of a platformer; clamping
 * pillarboxes it instead, which is the right answer for an orientation this
 * isn't built around. It has to sit below what the SQUAREST upright device asks
 * for, or it clips them instead — a 4:3 tablet wants about 213, so anything
 * higher puts bars back on exactly the screens that had none.
 */
const MIN_H = px(200);
const MAX_H = px(600);

function safeAspect(): number {
  // 1:2.0 if there is no DOM to ask — a middling phone, and only ever hit by
  // tooling that never renders.
  if (typeof document === 'undefined' || typeof window === 'undefined') return 2;

  let insetX = 0;
  let insetY = 0;
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right)' +
      ' env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.documentElement.append(probe);
    const s = getComputedStyle(probe);
    insetY = (parseFloat(s.paddingTop) || 0) + (parseFloat(s.paddingBottom) || 0);
    insetX = (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
    probe.remove();
  } catch {
    /* no env() support — insets stay zero, which is what those browsers mean */
  }

  const w = Math.max(1, window.innerWidth - insetX);
  const h = Math.max(1, window.innerHeight - insetY);
  return h / w;
}

export const VIEW_H = Math.round(Math.min(MAX_H, Math.max(MIN_H, VIEW_W * safeAspect())));
