/**
 * YAHIA — the runner.
 *
 * Authored at the game's own resolution rather than downscaled from reference
 * art: at 24px tall a detailed sprite turns to mush, so the silhouette has to
 * be drawn for this size directly. Design taken from the TUNISIA_HERO
 * reference — dark curly hair, cream tee, pink shorts, navy sneakers.
 *
 * Drawn in **right-facing profile**, not front-on. An auto-runner only ever
 * travels one direction, and a front-facing figure with legs splayed sideways
 * reads as a star jump however you animate it. Profile also gives the run cycle
 * somewhere to put a stride.
 *
 * Two frames the reference sheet doesn't have, because YAHIA needs them:
 *   SLIDE  — the second of the game's two verbs
 *   CORPSE — lying flat, because a body is a platform
 *
 * Legend:
 *   .  transparent   H  hair      S  skin      L  skin highlight
 *   s  skin shadow   T  shirt     t  shirt shadow
 *   P  shorts        p  shorts shadow
 *   B  shoe          b  shoe sole  K  eye
 */

export const SPRITE_PALETTE: Record<string, string> = {
  H: '#2a1a14',
  S: '#a8683f',
  s: '#7d4b2c',
  L: '#c88a56',
  T: '#f0ece0',
  t: '#cbc2b0',
  P: '#f28ba0',
  p: '#c96a82',
  B: '#36425e',
  b: '#5a6a92',
  K: '#17101a',
};

export interface Sprite {
  readonly rows: readonly string[];
  /** Sprite pixels left of the hitbox's left edge. */
  readonly ox: number;
  /** Sprite pixels above the hitbox's top edge. */
  readonly oy: number;
}

/** Head is identical in every upright frame — only limbs animate. */
const HEAD: readonly string[] = [
  '......HHHHHH........',
  '.....HHHHHHHH.......',
  '....HHHHHHSSSS......',
  '....HHHHHSSSSS......',
  '....HHHHSSKSSL......',
  '.....HHHSSSSSL......',
  '.....HHHSSSSs.......',
  '........Sss.........',
];

/** Contact: lead leg reaching forward, trailing leg pushed off with heel up. */
const RUN_1: readonly string[] = [
  ...HEAD,
  '......TTTTTTTT......',
  '.....SSTTTTTTTT.....',
  '....SS.TTTTTTTss....',
  '...SS..TTTTTT..ss...',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '.....PPP..PPPP......',
  '....SSS.....SSS.....',
  '...SSS.......SS.....',
  '..SSS.........SS....',
  '..BBBB........SS....',
  '..bbbb........SS....',
  '..............BBBB..',
  '..............bbbb..',
];

/** Passing: trailing knee driven forward under the body, foot lifted. */
const RUN_2: readonly string[] = [
  ...HEAD,
  '......TTTTTTTT......',
  '.....ssTTTTTTTSS....',
  '......sTTTTTTT.SS...',
  '.......TTTTTT...SS..',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '......PPPPPP........',
  '........SSSSSS......',
  '........SS..SSS.....',
  '........SS..SSS.....',
  '........SS.BBBB.....',
  '........SS.bbbb.....',
  '.......BBBB.........',
  '.......bbbb.........',
];

/** Full stride, both feet off the ground — the airborne beat of the cycle. */
const RUN_3: readonly string[] = [
  ...HEAD,
  '......TTTTTTTT......',
  '....SSSTTTTTTTT.....',
  '...SS..TTTTTTTss....',
  '..SS...TTTTTT..sss..',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '....PPPP..PPPP......',
  '...SSS......SSS.....',
  '..SSS........SSS....',
  '..SS...........SS...',
  '.SS............SS...',
  '.SS............SS...',
  'BBBB..........BBBB..',
  'bbbb..........bbbb..',
];

/** Passing, opposite phase: heel kicked up behind. */
const RUN_4: readonly string[] = [
  ...HEAD,
  '......TTTTTTTT......',
  '.....ssTTTTTTTSSS...',
  '......sTTTTTTT..SS..',
  '.......TTTTTT....SS.',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '......PPPPPP........',
  '.......SSSSSS.......',
  '.....SSS...SS.......',
  '.....SSS...SS.......',
  '....BBBB...SS.......',
  '....bbbb...SS.......',
  '..........BBBB......',
  '..........bbbb......',
];

const JUMP: readonly string[] = [
  ...HEAD,
  '...SS.TTTTTTTT.SS...',
  '...SS.TTTTTTTT.SS...',
  '....S.TTTTTTTT.S....',
  '.......TTTTTT.......',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '.....PPPP.PPPP......',
  '....SSS....SSSS.....',
  '...SSS......SSS.....',
  '...SS........SS.....',
  '..BBBB.......SS.....',
  '..bbbb.......SS.....',
  '.............BBBB...',
  '.............bbbb...',
];

const FALL: readonly string[] = [
  ...HEAD,
  '..SS..TTTTTTTT..SS..',
  '..SS..TTTTTTTT..SS..',
  '...S..TTTTTTTT..S...',
  '.......TTTTTT.......',
  '.......TTTTTt.......',
  '.......tttttt.......',
  '......PPPPPPP.......',
  '......PPPPPPP.......',
  '.....PPP..PPPP......',
  '....SSS.....SSS.....',
  '...SSS.......SSS....',
  '..SS...........SS...',
  '..SS...........SS...',
  '..SS...........SS...',
  '.BBBB.........BBBB..',
  '.bbbb.........bbbb..',
];

/** Leaning back, legs thrown forward. Invented — the reference has no slide. */
const SLIDE: readonly string[] = [
  '...HHHHHH...............',
  '..HHHHHHHH..............',
  '..HHHHSSSSL.............',
  '..HHHSSKSSL.............',
  '...HHSSSSs..............',
  '....SSs.TTTTT...........',
  '..SSSTTTTTTTTT..........',
  '..SStTTTTTTTTTtPP.......',
  '...SttTTTTTTTtPPPPP.....',
  '.......tttttPPPPPSSS....',
  '............PPPSSSSSS...',
  '..............SSSSSSSS..',
  '.................SBBBBB.',
  '..................bbbbb.',
];

/**
 * Face-down, sized to exactly match the collision box so there is no ambiguity
 * about where the platform's edges are. The shirt across the back forms the
 * flat top you land on.
 */
const CORPSE: readonly string[] = [
  '..HHHH..TTTTTTT.....',
  '.HHHHHH.TTTTTTTTPP..',
  '.HHHHHHHTTTTTTTTPPPS',
  '.HHSSSSStttttttPPPSS',
  '..sSSs..ttttttppSSSS',
  '...SSSSS......SSBBBB',
  '.....SSS.......BBBBB',
  '.......S........bbbb',
];

/**
 * Sprites are drawn larger than their hitbox and anchored feet-to-feet, so hair
 * and swinging limbs overhang. That reads as generous rather than unfair — you
 * clip scenery with your hair without dying for it.
 */
const STAND_OFFSET = { ox: -4, oy: -4 };
const SLIDE_OFFSET = { ox: -6, oy: -4 };

export const SPRITES = {
  run1: { rows: RUN_1, ...STAND_OFFSET },
  run2: { rows: RUN_2, ...STAND_OFFSET },
  run3: { rows: RUN_3, ...STAND_OFFSET },
  run4: { rows: RUN_4, ...STAND_OFFSET },
  jump: { rows: JUMP, ...STAND_OFFSET },
  fall: { rows: FALL, ...STAND_OFFSET },
  slide: { rows: SLIDE, ...SLIDE_OFFSET },
  corpse: { rows: CORPSE, ox: 0, oy: 0 },
} satisfies Record<string, Sprite>;

export type SpriteName = keyof typeof SPRITES;

export const RUN_CYCLE: readonly SpriteName[] = ['run1', 'run2', 'run3', 'run4'];

/** Height of the corpse sprite; the collision box is sized to match it. */
export const CORPSE_SPRITE_H = CORPSE.length;
export const CORPSE_SPRITE_W = CORPSE[0]!.length;

/**
 * Baked once into offscreen canvases — per-pixel fillRect for a dozen ghosts
 * and sixty corpses every frame is exactly the cost a phone can't absorb.
 */
export class SpriteBank {
  private baked = new Map<SpriteName, HTMLCanvasElement>();

  constructor() {
    for (const name of Object.keys(SPRITES) as SpriteName[]) {
      this.baked.set(name, bake(SPRITES[name].rows));
    }
  }

  get(name: SpriteName): HTMLCanvasElement {
    return this.baked.get(name)!;
  }

  /** Draw with the sprite's offset applied to a hitbox-space position. */
  draw(ctx: CanvasRenderingContext2D, name: SpriteName, hitboxX: number, hitboxY: number): void {
    const s = SPRITES[name];
    ctx.drawImage(this.get(name), Math.round(hitboxX + s.ox), Math.round(hitboxY + s.oy));
  }
}

function bake(rows: readonly string[]): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const color = SPRITE_PALETTE[row[x]!];
      if (color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Rows must be rectangular and use only known palette letters. */
export function validateSprites(): string[] {
  const problems: string[] = [];
  for (const [name, sprite] of Object.entries(SPRITES)) {
    const width = sprite.rows[0]?.length ?? 0;
    sprite.rows.forEach((row, y) => {
      if (row.length !== width) {
        problems.push(`${name} row ${y}: ${row.length} chars, expected ${width}`);
      }
      for (const ch of row) {
        if (ch !== '.' && SPRITE_PALETTE[ch] === undefined) {
          problems.push(`${name} row ${y}: unknown palette char "${ch}"`);
        }
      }
    });
  }
  return problems;
}
