import manifest from './hero.json';
import heroUrl from './hero.png';
import maskUrl from './hero-mask.png';

/**
 * The hero, and the kit colours that tell twelve players apart.
 *
 * Recolouring is a luminance remap, not a hue rotation. The shirt in the source
 * art is cream — saturation 0.14 — and rotating the hue of something that
 * desaturated changes nothing you can see. What carries the garment is its
 * shading, so that is what gets kept: each pixel's luminance is normalised
 * across the range the garment actually occupies (measured at slice time, not
 * assumed to be 0..1) and used to look up a ramp built from the kit colour.
 *
 * Which pixels are shirt and which are shorts comes from a mask baked by
 * tools/slice_hero.py, where the classification could be looked at.
 */

export interface Kit {
  readonly name: string;
  readonly color: string;
}

/**
 * A kit is a shirt colour and a shorts colour — but you pick the pair, not the
 * two halves.
 *
 * One hue head to toe was the first version and wasted the character. Two
 * independent pickers was the second, and 144 combinations sounds generous
 * until you notice most of them are ugly and choosing takes two decisions
 * before a game that takes ninety seconds. Twelve chosen outfits is one tap,
 * and every one of them looks deliberate.
 */
export interface KitChoice {
  readonly shirt: number;
  readonly shorts: number;
}

/**
 * The twelve outfits, as (shirt, shorts) into the palette.
 *
 * Picked so no two share a dominant colour — the point is telling twelve people
 * apart across a room, so "the green one" and "the orange one" have to be
 * unambiguous. The first is the supplied art's own cream over pink.
 */
export const KIT_COMBOS: readonly KitChoice[] = [
  { shirt: 11, shorts: 10 },
  { shirt: 11, shorts: 7 },
  { shirt: 2, shorts: 7 },
  { shirt: 0, shorts: 11 },
  { shirt: 6, shorts: 11 },
  { shirt: 4, shorts: 2 },
  { shirt: 7, shorts: 1 },
  { shirt: 9, shorts: 8 },
  { shirt: 3, shorts: 5 },
  { shirt: 1, shorts: 5 },
  { shirt: 8, shorts: 2 },
  { shirt: 5, shorts: 0 },
];

/**
 * Twelve, chosen for separation at a glance rather than for even spacing round
 * the wheel — indigo and violet are an even split and an unusable one on a
 * phone at arm's length.
 */
export const KITS: readonly Kit[] = [
  { name: 'Crimson', color: '#e03b4a' },
  { name: 'Ember', color: '#f07a2a' },
  { name: 'Gold', color: '#ecc23c' },
  { name: 'Lime', color: '#8fd13f' },
  { name: 'Jade', color: '#2fb573' },
  { name: 'Teal', color: '#25b3b3' },
  { name: 'Sky', color: '#3d9ad4' },
  { name: 'Cobalt', color: '#4a5ad8' },
  { name: 'Violet', color: '#9459d6' },
  { name: 'Magenta', color: '#d44bb8' },
  { name: 'Rose', color: '#ef6d8f' },
  { name: 'Bone', color: '#ded4b8' },
];

export const HERO_FRAME_W = manifest.frameW;
export const HERO_FRAME_H = manifest.frameH;
export const HERO_FRAMES = manifest.frames;


/** The shirt reads as a light tee in the kit's hue; the shorts carry it neat. */
const SHIRT_TINT = 0.18;

/**
 * Ramp ends, as how far each garment's shadow goes toward black and its
 * highlight toward white.
 *
 * The first pass ran both highlights half way to white and produced twelve sets
 * of pastel pyjamas. Most garment pixels sit high in their luminance range — the
 * source shirt is cream and the shorts are a light pink — so a generous
 * highlight is where nearly all of them land. Pulling it back is what makes a
 * kit read as a colour from across a room.
 */
const SHIRT_SHADOW = 0.28;
const SHIRT_HIGHLIGHT = 0.32;
const SHORTS_SHADOW = 0.42;
const SHORTS_HIGHLIGHT = 0.15;

/**
 * Bias applied to the normalised shading before the ramp lookup. Above 1 it
 * pushes pixels toward the shadow end, which is where the colour is.
 */
const SHADING_GAMMA = 1.5;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const rgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Shadow-to-highlight ramp for a garment.
 *
 * Not black-to-white through the hue: fabric in shadow keeps its colour, and a
 * ramp that runs to true black turns every kit into the same dark silhouette
 * in the folds — which is exactly the distinction we are trying to buy.
 */
function ramp(base: Rgb, shadow: number, highlight: number): [Rgb, Rgb] {
  return [mix(base, BLACK, shadow), mix(base, WHITE, highlight)];
}

let art: HTMLImageElement | null = null;
let mask: HTMLImageElement | null = null;

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

export async function loadHero(): Promise<void> {
  [art, mask] = await Promise.all([load(heroUrl), load(maskUrl)]);
}

function pixels(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

export interface Spans {
  readonly shirtSpan: readonly [number, number];
  readonly shortsSpan: readonly [number, number];
}

const HERO_SPANS: Spans = {
  shirtSpan: manifest.shirtSpan as [number, number],
  shortsSpan: manifest.shortsSpan as [number, number],
};

/** The runner atlas has its own shading range — it is drawn much smaller. */
export const RUNNER_SPANS: Spans = {
  shirtSpan: manifest.runner.shirtSpan as [number, number],
  shortsSpan: manifest.runner.shortsSpan as [number, number],
};

/**
 * Repaint one sheet's kit, given the mask that says which pixels are garment.
 *
 * Shared by the menu turnaround and the in-game runner, because they are the
 * same clothes on the same person and a kit that stopped at the menu would be
 * decoration rather than identity.
 */
export function recolourSheet(
  artImg: HTMLImageElement,
  maskImg: HTMLImageElement,
  spans: Spans,
  choice: KitChoice,
): HTMLCanvasElement {
  const shirtBase = rgb((KITS[choice.shirt] ?? KITS[0]!).color);
  const shortsBase = rgb((KITS[choice.shorts] ?? KITS[0]!).color);
  const [shirtLo, shirtHi] = ramp(mix(shirtBase, WHITE, SHIRT_TINT), SHIRT_SHADOW, SHIRT_HIGHLIGHT);
  const [shortsLo, shortsHi] = ramp(shortsBase, SHORTS_SHADOW, SHORTS_HIGHLIGHT);
  const SHIRT_SPAN = spans.shirtSpan;
  const SHORTS_SPAN = spans.shortsSpan;

  const src = pixels(artImg);
  const msk = pixels(maskImg);
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const m = msk.data;
  const o = out.data;

  for (let i = 0; i < s.length; i += 4) {
    o[i] = s[i]!;
    o[i + 1] = s[i + 1]!;
    o[i + 2] = s[i + 2]!;
    o[i + 3] = s[i + 3]!;
    if (s[i + 3]! < 128) continue;

    // Red channel marks shirt, green marks shorts. The mask is paletted, so
    // compare generously rather than against exact 255s.
    const isShirt = m[i]! > 128 && m[i + 1]! < 128;
    const isShorts = m[i + 1]! > 128 && m[i]! < 128;
    if (!isShirt && !isShorts) continue;

    const lum = (0.299 * s[i]! + 0.587 * s[i + 1]! + 0.114 * s[i + 2]!) / 255;
    const [lo, hi] = isShirt ? [shirtLo, shirtHi] : [shortsLo, shortsHi];
    const [min, max] = isShirt ? SHIRT_SPAN : SHORTS_SPAN;
    const t = Math.max(0, Math.min(1, (lum - min) / Math.max(0.0001, max - min)));
    const c = mix(lo, hi, Math.pow(t, SHADING_GAMMA));
    o[i] = c.r;
    o[i + 1] = c.g;
    o[i + 2] = c.b;
  }

  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.getContext('2d')!.putImageData(out, 0, 0);
  return canvas;
}

const sheets = new Map<string, HTMLCanvasElement>();

/**
 * The full turnaround in one kit, baked once.
 *
 * Lazily, and cached by the pair: recolouring is a quarter of a million pixel
 * writes, and there are 144 combinations now — baking them up front would spend
 * thirty million of them to show one.
 */
export function heroSheet(choice: KitChoice): HTMLCanvasElement | null {
  if (art === null || mask === null) return null;
  const id = `${choice.shirt}:${choice.shorts}`;
  const cached = sheets.get(id);
  if (cached !== undefined) return cached;

  const baked = recolourSheet(art, mask, HERO_SPANS, choice);
  sheets.set(id, baked);
  return baked;
}

/** Draw one frame of the turnaround, scaled up on the pixel grid. */
export function drawHero(
  ctx: CanvasRenderingContext2D,
  choice: KitChoice,
  frame: number,
  x: number,
  y: number,
  scale: number,
): void {
  const sheet = heroSheet(choice);
  if (sheet === null) return;
  const f = ((frame % HERO_FRAMES) + HERO_FRAMES) % HERO_FRAMES;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    f * HERO_FRAME_W,
    0,
    HERO_FRAME_W,
    HERO_FRAME_H,
    Math.round(x),
    Math.round(y),
    Math.round(HERO_FRAME_W * scale),
    Math.round(HERO_FRAME_H * scale),
  );
}
