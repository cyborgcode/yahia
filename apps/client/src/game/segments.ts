/**
 * The challenge library.
 *
 * "Random maps" means stitched, not noise-generated: every moment is
 * hand-authored, the generator only decides the order. Completability is
 * guaranteed by construction because each piece was verified by hand.
 *
 * Each segment declares a connection contract — the ground row at its left and
 * right edge — and the stitcher only joins pieces whose contracts line up.
 *
 * Legend:  `#` solid   `/` slope up-right   `\` slope down-right
 *          `^` spike   `=` breakable floor  `G` goal   `.` empty
 *          `E` a creature stands here — a marker, not a tile
 *
 * Rows only need to cover the segment's own geometry; headroom comes from the
 * level grid, and anything below an unfilled column is open void.
 */
export interface Segment {
  name: string;
  /** 1 = breather, 5 = nasty. Drives the difficulty arc. */
  tier: number;
  /** Techniques the segment demands. Informational for now; telemetry later. */
  requires: readonly ('jump' | 'slide' | 'slideJump' | 'momentum')[];
  /** Ground row index (within `rows`) at the left edge. */
  entry: number;
  /** Ground row index (within `rows`) at the right edge. */
  exit: number;
  rows: readonly string[];
}

export const SEGMENTS: readonly Segment[] = [
  // --- tier 1: breathers --------------------------------------------------
  {
    name: 'flat',
    tier: 1,
    requires: [],
    entry: 0,
    exit: 0,
    rows: ['##########', '##########'],
  },
  {
    name: 'hop',
    tier: 1,
    requires: ['jump'],
    entry: 0,
    exit: 0,
    rows: ['#####...####', '#####...####'],
  },

  // --- tier 2: single verb ------------------------------------------------
  {
    name: 'gap',
    tier: 2,
    requires: ['jump'],
    entry: 0,
    exit: 0,
    rows: ['#####.....####', '#####.....####'],
  },
  {
    name: 'ducker',
    tier: 2,
    requires: ['slide'],
    entry: 3,
    exit: 3,
    rows: [
      '....####....',
      '....####....',
      '............',
      '############',
    ],
  },
  {
    /**
     * Where the slide-jump is taught.
     *
     * Measured across 300 generated tracks, `slideJump` was introduced at tier 3
     * or worse every single time, because nothing below tier 3 asked for it —
     * the hardest technique in the game was only ever met inside a hard segment.
     * A mechanic gets a safe first meeting before it gets a test.
     *
     * The ducker's bar, then two tiles of gap. Two rather than the four in
     * `duck-and-leap`, so cancelling a fraction late still clears it: the lesson
     * here is that the cancel exists, not that it must be timed.
     */
    name: 'low-bar',
    tier: 2,
    requires: ['slide', 'slideJump'],
    entry: 3,
    exit: 3,
    rows: [
      '...####.........',
      '...####.........',
      '................',
      '##########..####',
    ],
  },
  {
    // Six tiles of runway, not three. A short descent gives the slide almost no
    // time to accelerate, which makes the whole momentum model unrewarding —
    // measured at a ~9% gain before this was lengthened.
    name: 'descent',
    tier: 2,
    requires: ['slide', 'momentum'],
    entry: 0,
    exit: 6,
    rows: [
      '\\.........',
      '#\\........',
      '##\\.......',
      '###\\......',
      '####\\.....',
      '#####\\....',
      '##########',
    ],
  },
  {
    name: 'ascent',
    tier: 2,
    requires: ['momentum'],
    entry: 6,
    exit: 0,
    rows: [
      '....../###',
      '...../####',
      '..../#####',
      '.../######',
      '../#######',
      './########',
      '##########',
    ],
  },

  // --- tier 3: chains -----------------------------------------------------
  {
    // A creature planted on open ground: pure reaction, nothing to read but
    // the gap you have to clear.
    name: 'sentry',
    tier: 2,
    requires: ['jump'],
    entry: 1,
    exit: 1,
    rows: ['.....E......', '############'],
  },
  {
    name: 'picket',
    tier: 3,
    requires: ['jump'],
    entry: 1,
    exit: 1,
    rows: ['...E.....E......', '################'],
  },
  {
    // The body is on the far lip, so the jump has to clear the gap AND land
    // short of what is waiting on the other side.
    name: 'gatekeeper',
    tier: 4,
    requires: ['jump', 'momentum'],
    entry: 1,
    exit: 1,
    rows: ['..........E.....', '#####.....######'],
  },
  {
    name: 'spikes',
    tier: 3,
    requires: ['jump'],
    entry: 1,
    exit: 1,
    rows: ['.....^^^....', '############'],
  },
  {
    name: 'tunnel',
    tier: 3,
    requires: ['slide'],
    entry: 3,
    exit: 3,
    rows: [
      '...##########...',
      '...##########...',
      '................',
      '################',
    ],
  },
  {
    name: 'duck-and-leap',
    tier: 3,
    requires: ['slide', 'slideJump'],
    entry: 3,
    exit: 3,
    rows: [
      '..######........',
      '..######........',
      '................',
      '##########....##',
    ],
  },
  {
    name: 'stairs',
    tier: 3,
    requires: ['momentum'],
    entry: 0,
    exit: 2,
    rows: ['##\\.......', '#####\\....', '##########'],
  },
  {
    // Climb, then leap from the top — momentum you spent going up you need back.
    name: 'ramp-up',
    tier: 3,
    requires: ['momentum', 'jump'],
    entry: 4,
    exit: 0,
    rows: [
      '..../#...###',
      '.../##......',
      '../###......',
      './####......',
      '######......',
    ],
  },
  {
    name: 'rotten-floor',
    tier: 3,
    requires: ['momentum'],
    entry: 0,
    exit: 0,
    rows: ['#####=====####', '#####=====####'],
  },

  // --- tier 4: demands speed ----------------------------------------------
  {
    name: 'long-fall',
    tier: 4,
    requires: ['jump'],
    entry: 0,
    exit: 5,
    rows: [
      '#####.........',
      '..............',
      '..............',
      '..............',
      '..............',
      '.......#######',
    ],
  },
  {
    name: 'chasm',
    tier: 4,
    requires: ['jump', 'momentum'],
    entry: 0,
    exit: 0,
    rows: ['#####......#####', '#####......#####'],
  },
  {
    // Slide the whole descent and launch straight off the end. The payoff
    // segment for the momentum model.
    name: 'plunge',
    tier: 4,
    requires: ['slide', 'slideJump', 'momentum'],
    entry: 0,
    exit: 4,
    rows: [
      '\\.............',
      '#\\............',
      '##\\...........',
      '###\\..........',
      '####.....#####',
    ],
  },
  {
    name: 'sawtooth',
    tier: 4,
    requires: ['jump'],
    entry: 1,
    exit: 1,
    rows: ['......^....^......', '###..###..###..###'],
  },

  // --- tier 5: the ones people will name ----------------------------------
  {
    name: 'meatgrinder',
    tier: 5,
    requires: ['jump', 'slide', 'slideJump'],
    entry: 3,
    exit: 3,
    rows: [
      '.....#######........',
      '.....#######........',
      '..^.............E...',
      '#############...####',
    ],
  },
];

export const START_SEGMENT: Segment = {
  name: 'start',
  tier: 1,
  requires: [],
  entry: 0,
  exit: 0,
  rows: ['################', '################'],
};

export const FINISH_SEGMENT: Segment = {
  name: 'finish',
  tier: 1,
  requires: [],
  entry: 1,
  exit: 1,
  rows: ['.........G......', '################'],
};

export function segmentWidth(s: Segment): number {
  return s.rows[0]!.length;
}
