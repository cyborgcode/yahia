import { px } from '../game/scale';
import { clamp } from '../game/tiles';
import { T } from '../game/tuning';
import { VIEW_H, VIEW_W } from '../game/view';
import type { World } from '../game/world';
import { P } from './palette';

/**
 * Drawn into the same backbuffer as the world, so the HUD lives on the same
 * pixel grid as everything else instead of floating above it in DOM.
 *
 * Layout is mobile-first: a player's thumbs sit over the bottom corners for the
 * whole round, so nothing readable goes there. Every persistent readout is
 * pinned to the top edge, which no thumb covers. Only transient centre-screen
 * text — death and finish — uses the middle.
 *
 * There used to be a third readout up here naming the current segment. At 14
 * tiles across there is no room for it: it collided with the speed bar on one
 * side and the clock on the other. It was the one thing here a player never
 * needed mid-run, and it still appears where it actually matters — on the death
 * banner, telling you what killed you.
 */
export function drawHud(ctx: CanvasRenderingContext2D, world: World, showHints: boolean): void {
  ctx.font = `bold ${px(8)}px monospace`;
  ctx.textBaseline = 'top';

  drawSpeed(ctx, world);
  drawTally(ctx, world);
  drawTimer(ctx, world);
  drawStanding(ctx, world);

  if (!world.player.alive) drawDeathBanner(ctx, world);
  if (world.finishedMs !== null) drawFinish(ctx, world);
  if (showHints) drawTouchHints(ctx);
}

function drawSpeed(ctx: CanvasRenderingContext2D, world: World): void {
  const p = world.player;
  const earned = clamp((p.vx - T.baseSpeed) / Math.max(1, T.maxSpeed - T.baseSpeed), 0, 1);

  ctx.fillStyle = P.hudBack;
  ctx.fillRect(px(4), px(4), px(78), px(16));

  ctx.fillStyle = P.hudDim;
  ctx.fillText('SPD', px(7), px(8));

  // Below base speed the bar is dim; earned speed lights up.
  const barX = px(28);
  const barW = px(48);
  ctx.fillStyle = '#2a2033';
  ctx.fillRect(barX, px(9), barW, px(6));
  ctx.fillStyle = P.hudDim;
  ctx.fillRect(barX, px(9), Math.round(barW * clamp(p.vx / T.maxSpeed, 0, 1)), px(6));
  if (earned > 0) {
    const baseFrac = T.baseSpeed / T.maxSpeed;
    ctx.fillStyle = P.goal;
    ctx.fillRect(
      barX + Math.round(barW * baseFrac),
      px(9),
      Math.round(barW * earned * (1 - baseFrac)),
      px(6),
    );
  }
}

/** Second row, top-left — deliberately not the bottom corner a thumb covers. */
function drawTally(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = P.hudBack;
  ctx.fillRect(px(4), px(22), px(132), px(16));
  ctx.fillStyle = P.hudDim;
  ctx.fillText('DEATHS', px(7), px(26));
  ctx.fillStyle = P.hud;
  ctx.fillText(String(world.deaths), px(52), px(26));
  ctx.fillStyle = P.hudDim;
  ctx.fillText('BODIES', px(68), px(26));
  ctx.fillStyle = P.corpseEdge;
  ctx.fillText(String(world.corpsesUsed.size), px(112), px(26));
}

/**
 * Third row, and only in a room: where you stand and how close it is to over.
 *
 * A player could see their speed, their deaths and the clock, and none of that
 * told them the one thing that decides the race — that it ends on the third
 * runner home rather than the last. Without it the round can end on you
 * mid-stride for no visible reason. With it, "two are home" is the moment a
 * risky shortcut becomes worth taking.
 *
 * Rank counts the finished as ahead of you, because they are: a ghost stream
 * only carries people still running, so ordering by position alone would
 * quietly promote you every time somebody crossed the line.
 */
function drawStanding(ctx: CanvasRenderingContext2D, world: World): void {
  const race = world.race;
  if (race === null) return;

  const ahead = world.ghosts.reduce((n, g) => (g.x > world.player.x ? n + 1 : n), 0);
  const place = race.myPlace ?? race.home + ahead + 1;
  const total = race.home + world.ghosts.length + (race.myPlace === null ? 1 : 0);
  const left = Math.max(0, race.ends - race.home);
  // One spot left is the whole tension of the format, so it is the one state
  // that gets a colour rather than a number you have to subtract yourself.
  const urgent = left === 1 && race.myPlace === null;

  ctx.fillStyle = P.hudBack;
  ctx.fillRect(px(4), px(40), px(132), px(16));

  ctx.fillStyle = P.hudDim;
  ctx.fillText('PLACE', px(7), px(44));
  ctx.fillStyle = P.hud;
  ctx.fillText(`${place}/${total}`, px(40), px(44));

  ctx.fillStyle = P.hudDim;
  ctx.fillText('HOME', px(70), px(44));
  ctx.fillStyle = urgent ? P.goal : P.hud;
  ctx.fillText(`${race.home}/${race.ends}`, px(102), px(44));
}

/**
 * Left of the corner, so the tuner button can own the corner itself.
 *
 * The gap is 28 rather than 42: the button is a fixed 44 CSS px whatever the
 * viewport, and at 14 tiles across that is 28 of these units, not 42. Reserving
 * the old figure wasted a fifth of the top bar on a screen that no longer has
 * width to spare.
 */
function drawTimer(ctx: CanvasRenderingContext2D, world: World): void {
  const ms = world.finishedMs ?? world.timeMs;
  ctx.fillStyle = P.hudBack;
  ctx.fillRect(VIEW_W - px(74), px(4), px(46), px(16));
  ctx.fillStyle = P.hud;
  ctx.fillText((ms / 1000).toFixed(2).padStart(6, ' '), VIEW_W - px(70), px(8));
}

function drawDeathBanner(ctx: CanvasRenderingContext2D, world: World): void {
  // Same reason: a scrim, so the message survives whatever biome is behind it.
  ctx.fillStyle = 'rgba(10,7,14,0.55)';
  ctx.fillRect(0, VIEW_H / 2 - px(20), VIEW_W, px(44));
  ctx.textAlign = 'center';
  ctx.fillStyle = P.hazard;
  ctx.fillText(`DIED AT ${world.lastDeathAt.toUpperCase()}`, VIEW_W / 2, VIEW_H / 2 - px(12));
  ctx.fillStyle = P.hudDim;
  ctx.fillText('your body stays behind', VIEW_W / 2, VIEW_H / 2 + px(2));
  ctx.textAlign = 'left';
}

function drawFinish(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = 'rgba(10,7,14,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';

  ctx.fillStyle = P.goal;
  ctx.font = `bold ${px(16)}px monospace`;
  ctx.fillText('YAHIA', VIEW_W / 2, VIEW_H / 2 - px(44));

  ctx.font = `bold ${px(8)}px monospace`;
  ctx.fillStyle = P.hud;
  ctx.fillText(`TIME  ${((world.finishedMs ?? 0) / 1000).toFixed(2)}s`, VIEW_W / 2, VIEW_H / 2 - px(18));
  ctx.fillText(`DEATHS  ${world.deaths}`, VIEW_W / 2, VIEW_H / 2 - px(6));
  ctx.fillText(`TOP SPEED  ${Math.round(world.topSpeed / px(1))}`, VIEW_W / 2, VIEW_H / 2 + px(6));
  ctx.fillStyle = P.corpseEdge;
  ctx.fillText(`BODIES CLIMBED  ${world.corpsesUsed.size}`, VIEW_W / 2, VIEW_H / 2 + px(18));

  ctx.fillStyle = P.hudDim;
  ctx.fillText('TAP FOR A NEW TRACK', VIEW_W / 2, VIEW_H / 2 + px(38));
  ctx.textAlign = 'left';
}

function drawTouchHints(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = P.playerSash;
  ctx.fillRect(0, VIEW_H - px(90), VIEW_W / 2, px(90));
  ctx.fillStyle = P.goal;
  ctx.fillRect(VIEW_W / 2, VIEW_H - px(90), VIEW_W / 2, px(90));
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = P.hud;
  ctx.fillText('HOLD TO SLIDE', VIEW_W * 0.25, VIEW_H - px(52));
  ctx.fillText('TAP TO JUMP', VIEW_W * 0.75, VIEW_H - px(52));
  ctx.fillStyle = P.hudDim;
  ctx.fillText('slide off a slope to build speed', VIEW_W / 2, VIEW_H - px(28));
  ctx.fillText('slide + jump = long and flat', VIEW_W / 2, VIEW_H - px(16));
  ctx.textAlign = 'left';
}
