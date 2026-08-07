import { Rng } from '../core/rng';
import {
  FINISH_SEGMENT,
  SEGMENTS,
  START_SEGMENT,
  segmentWidth,
  type Segment,
} from './segments';
import { px } from './scale';
import { CHAR_TO_TILE, TILE, Tile, isGround } from './tiles';

const GRID_H = 40;
const BASE_ROW = 22;
/** Keep the track from wandering off the top or bottom of the grid. */
const MIN_ROW = 8;
const MAX_ROW = 30;
/** Visual thickness under any walkable surface. */
const FILL_DEPTH = 3;
/** How many recent segment names to avoid repeating. */
const RECENT_MEMORY = 4;
/** Force an elevation change after this many flat segments in a row. */
const FLAT_RUN_LIMIT = 4;

export interface Checkpoint {
  x: number;
  y: number;
}

export class Level {
  readonly w: number;
  readonly h = GRID_H;
  readonly data: Uint8Array;
  readonly checkpoints: Checkpoint[] = [];
  readonly placed: { name: string; x: number }[] = [];
  goalX = 0;

  constructor(widthInTiles: number) {
    this.w = widthInTiles;
    this.data = new Uint8Array(widthInTiles * GRID_H);
  }

  get pxWidth(): number {
    return this.w * TILE;
  }

  get pxHeight(): number {
    return this.h * TILE;
  }

  get(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return Tile.Empty;
    return this.data[ty * this.w + tx] as Tile;
  }

  set(tx: number, ty: number, t: Tile): void {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
    this.data[ty * this.w + tx] = t;
  }

  /** Which named segment contains this world X — for "you died at Meatgrinder". */
  segmentNameAt(worldX: number): string {
    let name = '—';
    for (const p of this.placed) {
      if (worldX >= p.x) name = p.name;
      else break;
    }
    return name;
  }
}

/** Difficulty arc: ramp from tier 1 to tier 5 across the track, with wobble. */
function targetTier(progress: number, rng: Rng): number {
  const ramp = 1 + progress * 4;
  const wobble = rng.int(-1, 1);
  return Math.max(1, Math.min(5, Math.round(ramp + wobble)));
}

/**
 * Build a track from a seed. The server ships 4 bytes; every client rebuilds
 * this identically. Integer math only — no float drift across devices.
 */
export function buildLevel(seed: number, segmentCount = 24): Level {
  const rng = new Rng(seed);

  // Choose the segment order first so we know the total width up front.
  const chosen: Segment[] = [START_SEGMENT];
  let row = BASE_ROW;
  const recent: string[] = [];
  let sinceElevation = 0;

  /** Only pieces that keep the track inside the grid are eligible. */
  const fits = (s: Segment) => {
    const offset = row - s.entry;
    const exitRow = offset + s.exit;
    return (
      offset >= 0 &&
      offset + s.rows.length + FILL_DEPTH <= GRID_H &&
      exitRow >= MIN_ROW &&
      exitRow <= MAX_ROW
    );
  };

  /** Sampling by tier alone produced tracks with the same piece five times. */
  const fresh = (pool: Segment[]) => {
    const unseen = pool.filter((s) => !recent.includes(s.name));
    return unseen.length > 0 ? unseen : pool;
  };

  const place = (s: Segment) => {
    chosen.push(s);
    row = row - s.entry + s.exit;
    recent.push(s.name);
    if (recent.length > RECENT_MEMORY) recent.shift();
    sinceElevation = s.entry === s.exit ? sinceElevation + 1 : 0;
  };

  for (let i = 0; i < segmentCount; i++) {
    // Slopes are the only source of banked speed, and tier sampling alone left
    // them out of whole tracks — so force one when the ground has been flat
    // for too long.
    const slopes = SEGMENTS.filter((s) => s.entry !== s.exit && fits(s));
    let pool: Segment[];
    if (sinceElevation >= FLAT_RUN_LIMIT && slopes.length > 0) {
      pool = fresh(slopes);
    } else {
      const tier = targetTier(i / segmentCount, rng);
      let byTier = SEGMENTS.filter((s) => s.tier === tier && fits(s));
      if (byTier.length === 0) byTier = SEGMENTS.filter(fits);
      pool = fresh(byTier);
    }
    if (pool.length === 0) pool = [SEGMENTS[0]!];
    const pick = rng.pick(pool);
    place(pick);

    // A breather after anything nasty, so the track has rhythm.
    if (pick.tier >= 4) {
      const breathers = fresh(SEGMENTS.filter((s) => s.tier === 1 && fits(s)));
      if (breathers.length > 0) place(rng.pick(breathers));
    }
  }
  chosen.push(FINISH_SEGMENT);

  const totalW = chosen.reduce((sum, s) => sum + segmentWidth(s), 0);
  const level = new Level(totalW);

  // Stamp the segments.
  let cursor = 0;
  row = BASE_ROW;
  chosen.forEach((seg, index) => {
    const offset = row - seg.entry;
    level.placed.push({ name: seg.name, x: cursor * TILE });

    for (let ry = 0; ry < seg.rows.length; ry++) {
      const line = seg.rows[ry]!;
      for (let rx = 0; rx < line.length; rx++) {
        const t = CHAR_TO_TILE[line[rx]!] ?? Tile.Empty;
        if (t !== Tile.Empty) level.set(cursor + rx, offset + ry, t);
        if (t === Tile.Goal) level.goalX = (cursor + rx) * TILE;
      }
    }

    // Checkpoint every third segment, on the ground at its left edge.
    if (index % 3 === 0) {
      const surfaceRow = offset + seg.entry;
      level.checkpoints.push({ x: cursor * TILE + px(4), y: surfaceRow * TILE });
    }

    cursor += segmentWidth(seg);
    row = offset + seg.exit;
  });

  fillBelowGround(level);
  return level;
}

/** Give every walkable surface visual thickness without plugging the gaps. */
function fillBelowGround(level: Level): void {
  for (let tx = 0; tx < level.w; tx++) {
    let lowest = -1;
    for (let ty = 0; ty < level.h; ty++) {
      if (isGround(level.get(tx, ty))) lowest = ty;
    }
    if (lowest < 0) continue;
    for (let ty = lowest + 1; ty <= lowest + FILL_DEPTH; ty++) {
      if (level.get(tx, ty) === Tile.Empty) level.set(tx, ty, Tile.Solid);
    }
  }
}
