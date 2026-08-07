import type { Level } from './level';
import { TILE, Tile, isDeadly, isGround, isWall, slopeDir, surfaceY } from './tiles';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Corpse {
  x: number;
  y: number;
  w: number;
  h: number;
  born: number;
  /** Which segment it died in — feeds the post-round "you died at X" stat. */
  where: string;
}

export interface GroundHit {
  /** World Y of the surface. */
  y: number;
  /** +1 climbing rightward, -1 descending, 0 flat. */
  slope: number;
  tile: Tile;
  tx: number;
  ty: number;
}

/** A lip this tall or shorter is run over rather than blocking you. */
const STEP_UP = 20;

/**
 * Highest walkable surface under `sx` within the snap window.
 *
 * Sampling a height map rather than resolving AABBs against slope polygons is
 * the whole trick: flat ground, 45-degree slopes and corpses all answer the
 * same question, so the player only ever deals with one number.
 */
export function groundAt(
  level: Level,
  corpses: readonly Corpse[],
  sx: number,
  feet: number,
  snapUp: number,
  snapDown: number,
): GroundHit | null {
  let best: GroundHit | null = null;

  const tx = Math.floor(sx / TILE);
  const tyStart = Math.floor((feet - snapUp) / TILE);
  const tyEnd = Math.floor((feet + snapDown) / TILE);

  for (let ty = tyStart; ty <= tyEnd; ty++) {
    const t = level.get(tx, ty);
    if (!isGround(t)) continue;
    const sy = surfaceY(t, tx, ty, sx);
    if (sy < feet - snapUp || sy > feet + snapDown) continue;
    if (best === null || sy < best.y) best = { y: sy, slope: slopeDir(t), tile: t, tx, ty };
  }

  for (const c of corpses) {
    if (sx < c.x || sx > c.x + c.w) continue;
    if (c.y < feet - snapUp || c.y > feet + snapDown) continue;
    if (best === null || c.y < best.y) {
      best = { y: c.y, slope: 0, tile: Tile.Solid, tx: -1, ty: -1 };
    }
  }

  return best;
}

/**
 * Where the box must be pushed back to if it ran into a wall, or null.
 * Slopes never block horizontally — they push you up via the height map.
 */
export function resolveHorizontal(
  level: Level,
  corpses: readonly Corpse[],
  box: Box,
  dir: number,
): number | null {
  const feet = box.y + box.h;
  const tyStart = Math.floor(box.y / TILE);
  const tyEnd = Math.floor((feet - 1) / TILE);
  const txEdge = dir > 0 ? Math.floor((box.x + box.w - 1) / TILE) : Math.floor(box.x / TILE);

  for (let ty = tyStart; ty <= tyEnd; ty++) {
    if (!isWall(level.get(txEdge, ty))) continue;
    // A surface at or below the feet is a step, not a wall.
    if (ty * TILE >= feet - STEP_UP) continue;
    return dir > 0 ? txEdge * TILE - box.w : (txEdge + 1) * TILE;
  }

  for (const c of corpses) {
    if (!overlaps(box, c)) continue;
    if (c.y >= feet - STEP_UP) continue;
    return dir > 0 ? c.x - box.w : c.x + c.w;
  }

  return null;
}

/** World Y to push the box down to if its head hit something, or null. */
export function resolveCeiling(
  level: Level,
  corpses: readonly Corpse[],
  box: Box,
): number | null {
  const ty = Math.floor(box.y / TILE);
  const txStart = Math.floor(box.x / TILE);
  const txEnd = Math.floor((box.x + box.w - 1) / TILE);

  for (let tx = txStart; tx <= txEnd; tx++) {
    if (isWall(level.get(tx, ty))) return (ty + 1) * TILE;
  }

  for (const c of corpses) {
    if (!overlaps(box, c)) continue;
    if (c.y + c.h <= box.y + box.h * 0.5) return c.y + c.h;
  }

  return null;
}

/** Is there room to stand up here? Used to refuse un-sliding under a ceiling. */
export function hasHeadroom(
  level: Level,
  corpses: readonly Corpse[],
  box: Box,
  extra: number,
): boolean {
  const probe: Box = { x: box.x, y: box.y - extra, w: box.w, h: extra };
  const tyStart = Math.floor(probe.y / TILE);
  const tyEnd = Math.floor((probe.y + probe.h - 1) / TILE);
  const txStart = Math.floor(probe.x / TILE);
  const txEnd = Math.floor((probe.x + probe.w - 1) / TILE);

  for (let ty = tyStart; ty <= tyEnd; ty++) {
    for (let tx = txStart; tx <= txEnd; tx++) {
      if (isWall(level.get(tx, ty))) return false;
    }
  }
  for (const c of corpses) {
    if (overlaps(probe, c)) return false;
  }
  return true;
}

export function touchesDeadly(level: Level, box: Box): boolean {
  const txStart = Math.floor(box.x / TILE);
  const txEnd = Math.floor((box.x + box.w - 1) / TILE);
  const tyStart = Math.floor(box.y / TILE);
  const tyEnd = Math.floor((box.y + box.h - 1) / TILE);

  for (let ty = tyStart; ty <= tyEnd; ty++) {
    for (let tx = txStart; tx <= txEnd; tx++) {
      if (isDeadly(level.get(tx, ty))) return true;
    }
  }
  return false;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
