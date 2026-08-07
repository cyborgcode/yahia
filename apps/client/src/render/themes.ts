/**
 * Biomes.
 *
 * The design always called for these to be cheap — palette swap, tileset swap,
 * one signature hazard — so the tile and backdrop generators take a theme
 * rather than hard-coding colours. Adding a biome is adding an entry here.
 *
 * Two rules survive every theme, because they are readability contracts rather
 * than decoration:
 *   1. `hazard` is one saturated colour used nowhere else in that biome.
 *   2. Backdrop colours are desaturated AND far from the terrain in value, so
 *      background can never be mistaken for something you can stand on.
 */
export interface Theme {
  readonly name: string;

  /** Ground body, from the surface down. */
  readonly body: string;
  readonly bodyDark: string;
  readonly bodyDeep: string;
  /** Seams: mortar in stone, soil striations in earth. */
  readonly seam: string;
  /** The lit surface you land on, and its brightest edge. */
  readonly cap: string;
  readonly capLit: string;
  /** Breakable ground. */
  readonly weak: string;
  readonly weakDark: string;

  readonly hazard: string;
  readonly hazardDark: string;

  readonly skyTop: string;
  readonly skyBottom: string;
  readonly haze: string;
  readonly far: string;
  readonly near: string;
  readonly detail: string;

  /** Ground structure: cut blocks, or organic layers. */
  readonly surface: 'masonry' | 'earth';
  /** How the cap meets the air: a chipped stone edge, or grass blades. */
  readonly fringe: 'chipped' | 'grass';
  readonly backdrop: 'towers' | 'trees';
  /** Where tile art comes from: generated here, or sliced from a real tileset. */
  readonly art: 'procedural' | 'atlas';
}

export const THEMES = {
  ruins: {
    name: 'ruins',
    body: '#6d4c33',
    bodyDark: '#4a3323',
    bodyDeep: '#33241a',
    seam: '#3d2a1d',
    cap: '#b98d5f',
    capLit: '#d8ac7a',
    weak: '#7a6a55',
    weakDark: '#584c3d',
    hazard: '#ff2f55',
    hazardDark: '#a81334',
    skyTop: '#150f1b',
    skyBottom: '#2a1d2e',
    haze: '140,84,104',
    far: '#221a2a',
    near: '#2e2334',
    detail: '#191320',
    surface: 'masonry',
    fringe: 'chipped',
    backdrop: 'towers',
    art: 'procedural',
  },
  forest: {
    name: 'forest',
    body: '#7d5735',
    bodyDark: '#553a22',
    bodyDeep: '#33240f',
    seam: '#43301c',
    cap: '#4f8f3a',
    capLit: '#7dc154',
    weak: '#8a6f4a',
    weakDark: '#5f4c33',
    // Kept in the same saturated red family: the hazard colour is a contract
    // with the player, not a mood, and it should not change between biomes.
    hazard: '#ff2f55',
    hazardDark: '#a81334',
    skyTop: '#0f1a16',
    skyBottom: '#22352a',
    haze: '96,140,104',
    far: '#16241d',
    near: '#25392c',
    detail: '#141f18',
    surface: 'earth',
    fringe: 'grass',
    backdrop: 'trees',
    art: 'procedural',
  },
  night: {
    // The supplied tileset's own palette. It ships moons, so it is a night
    // biome; the sky is pitched darker than the art's ground interior so a
    // solid mass still reads as solid against it.
    name: 'night',
    body: '#3c3352',
    bodyDark: '#272034',
    bodyDeep: '#1b1626',
    seam: '#231d30',
    cap: '#e0622f',
    capLit: '#5bd94c',
    weak: '#3f4a63',
    weakDark: '#2a3244',
    hazard: '#ff2f55',
    hazardDark: '#a81334',
    skyTop: '#07060d',
    skyBottom: '#171327',
    haze: '90,72,140',
    far: '#2b3c56',
    near: '#3b5273',
    detail: '#141221',
    surface: 'masonry',
    fringe: 'chipped',
    backdrop: 'trees',
    art: 'atlas',
  },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

/**
 * The active biome. A URL override exists so a track can be looked at in every
 * biome without a rebuild — the generator is deterministic, so the same seed
 * gives the same track in each.
 */
function pick(): Theme {
  const params = new URLSearchParams(location.search);
  const wanted = params.get('theme');
  if (wanted !== null && wanted in THEMES) return THEMES[wanted as ThemeName];
  return THEMES.night;
}

export const THEME: Theme = pick();
