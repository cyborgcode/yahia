import { px } from './scale';

export const TILE = px(16);

/** Plain object rather than `const enum` — safe under isolatedModules. */
export const Tile = {
  Empty: 0,
  Solid: 1,
  /** Ground rising toward the right: `/` */
  SlopeR: 2,
  /** Ground falling toward the right: `\` */
  SlopeL: 3,
  Spike: 4,
  /** Solid until a runner crosses it, then it drops away. */
  Breakable: 5,
  Goal: 6,
  /** Not solid: a spawn marker the level reads and then clears. */
  EnemyMark: 7,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];

export const CHAR_TO_TILE: Record<string, Tile> = {
  '.': Tile.Empty,
  ' ': Tile.Empty,
  '#': Tile.Solid,
  '/': Tile.SlopeR,
  '\\': Tile.SlopeL,
  '^': Tile.Spike,
  '=': Tile.Breakable,
  G: Tile.Goal,
  E: Tile.EnemyMark,
};

/** Tiles you can stand on. */
export function isGround(t: Tile): boolean {
  return t === Tile.Solid || t === Tile.SlopeR || t === Tile.SlopeL || t === Tile.Breakable;
}

/** Tiles that block horizontal movement. Slopes never do — they push you up. */
export function isWall(t: Tile): boolean {
  return t === Tile.Solid || t === Tile.Breakable;
}

export function isDeadly(t: Tile): boolean {
  return t === Tile.Spike;
}

/**
 * World-space Y of the walkable surface of a ground tile at a given world X.
 * Slopes interpolate across the tile, which is what turns slope collision into
 * a height-map lookup instead of polygon clipping.
 */
export function surfaceY(t: Tile, tx: number, ty: number, worldX: number): number {
  const top = ty * TILE;
  if (t === Tile.SlopeR) return top + (TILE - clamp(worldX - tx * TILE, 0, TILE));
  if (t === Tile.SlopeL) return top + clamp(worldX - tx * TILE, 0, TILE);
  return top;
}

/** Slope gradient: +1 climbing rightward, -1 descending, 0 flat. */
export function slopeDir(t: Tile): number {
  if (t === Tile.SlopeR) return 1;
  if (t === Tile.SlopeL) return -1;
  return 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
