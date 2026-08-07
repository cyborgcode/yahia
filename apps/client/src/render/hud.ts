import { clamp } from '../game/tiles';
import { T } from '../game/tuning';
import { VIEW_H, VIEW_W } from '../game/view';
import type { World } from '../game/world';
import { P } from './palette';

/**
 * Drawn into the same 960x540 backbuffer as the world, so the HUD lives on the
 * same pixel grid as everything else instead of floating above it in DOM.
 */
export function drawHud(ctx: CanvasRenderingContext2D, world: World, showHints: boolean): void {
  ctx.font = 'bold 16px monospace';
  ctx.textBaseline = 'top';

  drawSpeed(ctx, world);
  drawTimer(ctx, world);
  drawTally(ctx, world);
  drawSegmentName(ctx, world);

  if (!world.player.alive) drawDeathBanner(ctx, world);
  if (world.finishedMs !== null) drawFinish(ctx, world);
  if (showHints) drawTouchHints(ctx);
}

function drawSpeed(ctx: CanvasRenderingContext2D, world: World): void {
  const p = world.player;
  const t = clamp((p.vx - T.baseSpeed) / Math.max(1, T.maxSpeed - T.baseSpeed), 0, 1);

  ctx.fillStyle = P.hudBack;
  ctx.fillRect(8, 8, 156, 32);

  ctx.fillStyle = P.hudDim;
  ctx.fillText('SPD', 14, 16);

  // Below base speed the bar is dim; earned speed lights up.
  const barX = 56;
  const barW = 96;
  ctx.fillStyle = '#2a2033';
  ctx.fillRect(barX, 18, barW, 12);
  ctx.fillStyle = P.hudDim;
  ctx.fillRect(barX, 18, Math.round(barW * clamp(p.vx / T.maxSpeed, 0, 1)), 12);
  if (t > 0) {
    const baseFrac = T.baseSpeed / T.maxSpeed;
    ctx.fillStyle = P.goal;
    ctx.fillRect(barX + Math.round(barW * baseFrac), 18, Math.round(barW * t * (1 - baseFrac)), 12);
  }
}

function drawTimer(ctx: CanvasRenderingContext2D, world: World): void {
  const ms = world.finishedMs ?? world.timeMs;
  ctx.fillStyle = P.hudBack;
  ctx.fillRect(VIEW_W - 100, 8, 92, 32);
  ctx.fillStyle = P.hud;
  ctx.fillText((ms / 1000).toFixed(2).padStart(6, ' '), VIEW_W - 92, 16);
}

function drawTally(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = P.hudBack;
  ctx.fillRect(8, VIEW_H - 40, 264, 32);
  ctx.fillStyle = P.hudDim;
  ctx.fillText('DEATHS', 14, VIEW_H - 32);
  ctx.fillStyle = P.hud;
  ctx.fillText(String(world.deaths), 104, VIEW_H - 32);
  ctx.fillStyle = P.hudDim;
  ctx.fillText('BODIES USED', 136, VIEW_H - 32);
  ctx.fillStyle = P.corpseEdge;
  ctx.fillText(String(world.corpsesUsed.size), 256, VIEW_H - 32);
}

function drawSegmentName(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = P.hudDim;
  ctx.textAlign = 'center';
  ctx.fillText(world.level.segmentNameAt(world.player.x).toUpperCase(), VIEW_W / 2, 16);
  ctx.textAlign = 'left';
}

function drawDeathBanner(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = P.hazard;
  ctx.fillText(`DIED AT ${world.lastDeathAt.toUpperCase()}`, VIEW_W / 2, VIEW_H / 2 - 24);
  ctx.fillStyle = P.hudDim;
  ctx.fillText('your body stays behind', VIEW_W / 2, VIEW_H / 2 + 4);
  ctx.textAlign = 'left';
}

function drawFinish(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = 'rgba(10,7,14,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';

  ctx.fillStyle = P.goal;
  ctx.font = 'bold 32px monospace';
  ctx.fillText('YAHIA', VIEW_W / 2, VIEW_H / 2 - 88);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = P.hud;
  ctx.fillText(`TIME  ${((world.finishedMs ?? 0) / 1000).toFixed(2)}s`, VIEW_W / 2, VIEW_H / 2 - 36);
  ctx.fillText(`DEATHS  ${world.deaths}`, VIEW_W / 2, VIEW_H / 2 - 12);
  ctx.fillText(`TOP SPEED  ${Math.round(world.topSpeed)}`, VIEW_W / 2, VIEW_H / 2 + 12);
  ctx.fillStyle = P.corpseEdge;
  ctx.fillText(`BODIES CLIMBED  ${world.corpsesUsed.size}`, VIEW_W / 2, VIEW_H / 2 + 36);

  ctx.fillStyle = P.hudDim;
  ctx.fillText('TAP OR PRESS R FOR A NEW TRACK', VIEW_W / 2, VIEW_H / 2 + 76);
  ctx.textAlign = 'left';
}

function drawTouchHints(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = P.playerSash;
  ctx.fillRect(0, VIEW_H - 180, VIEW_W / 2, 180);
  ctx.fillStyle = P.goal;
  ctx.fillRect(VIEW_W / 2, VIEW_H - 180, VIEW_W / 2, 180);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = P.hud;
  ctx.fillText('HOLD TO SLIDE', VIEW_W * 0.25, VIEW_H - 104);
  ctx.fillText('TAP TO JUMP', VIEW_W * 0.75, VIEW_H - 104);
  ctx.fillStyle = P.hudDim;
  ctx.fillText('slide off a slope to build speed', VIEW_W / 2, VIEW_H - 56);
  ctx.fillText('slide + jump = long and flat', VIEW_W / 2, VIEW_H - 32);
  ctx.textAlign = 'left';
}
