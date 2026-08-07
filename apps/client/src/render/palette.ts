/**
 * Sun-bleached ruins: ochre, terracotta, bone, lapis.
 *
 * The rules that matter more than the hues:
 *   1. HAZARD is one saturated colour used nowhere else in the game.
 *   2. Background is desaturated AND separated by a large value gap, never
 *      mid-tone — background reading as standable floor is the fastest way to
 *      make a pixel platformer feel unfair.
 *   3. Opacity means solidity. Corpses are opaque and outlined; living rivals
 *      will be 25% ghosts. The visual language *is* the collision rule.
 */
export const P = {
  skyTop: '#150f1b',
  skyBottom: '#2a1d2e',
  ruinFar: '#221a2a',
  ruinNear: '#2e2334',

  terrain: '#6d4c33',
  terrainLip: '#a87c52',
  terrainDeep: '#3c2a1d',

  breakable: '#7a6a55',
  breakableLip: '#a2917a',

  hazard: '#ff2f55',

  player: '#f2e3c4',
  playerSash: '#3d9ad4',
  playerShadow: '#8f7f63',

  corpse: '#c9853a',
  corpseEdge: '#ffd98a',

  checkpoint: '#3d9ad4',
  goal: '#ffd75e',

  hud: '#f2e3c4',
  hudDim: '#8a7c93',
  hudBack: 'rgba(10,7,14,0.72)',
} as const;
