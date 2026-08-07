/**
 * Seeded PRNG — mulberry32.
 *
 * Level generation must be bit-identical across a Pixel, an iPhone and a
 * five-year-old Android, because the server ships a 4-byte seed instead of a
 * map. Integer math only; never use Math.random() in generation.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<TItem>(items: readonly TItem[]): TItem {
    return items[this.int(0, items.length - 1)]!;
  }
}

/** Turn a room code like "KX4P" into a stable seed. */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
