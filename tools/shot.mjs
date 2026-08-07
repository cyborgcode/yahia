/**
 * Presentation screenshots at a realistic device pixel ratio.
 *
 * A phone renders the internal buffer into ~2500 device pixels, so capturing at
 * deviceScaleFactor 1 downsamples the art and shows something nobody will ever
 * see. Shoot at DPR 3.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const URL = process.env.URL ?? 'http://127.0.0.1:4173/#seed=yahia';
const OUT = process.env.OUT ?? './shot.png';

const browser = await chromium.launch();
// Portrait, because that is how the game is held. LANDSCAPE=1 shoots the
// pillarboxed variant instead.
const portrait = process.env.LANDSCAPE !== '1';
const page = await browser.newPage({
  viewport: portrait ? { width: 390, height: 844 } : { width: 844, height: 390 },
  deviceScaleFactor: 3,
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// Dismiss the first-run touch hints.
await page.mouse.click(portrait ? 200 : 700, portrait ? 640 : 200);
await page.waitForTimeout(100);

// Find a column that actually has ground with headroom above it, walking back
// from a hazard segment — placing blind lands in a gap.
const placed = await page.evaluate((wantSeg) => {
  const w = window.yahia;
  const L = w.level;
  const seg =
    L.placed.find((p) => p.name === wantSeg) ??
    L.placed.find((p) => p.name === 'meatgrinder') ??
    L.placed.find((p) => p.name === 'spikes') ??
    L.placed[8];
  const TILE = window.yahiaScale * 16;
  const base = Math.floor(seg.x / TILE);
  for (let dx = 14; dx < 48; dx++) {
    const tx = base - dx;
    if (tx < 2) break;
    let ty = 0;
    while (ty < L.h && L.get(tx, ty) === 0) ty++;
    if (ty >= L.h || ty < 3) continue;
    if (L.get(tx, ty - 1) !== 0 || L.get(tx, ty - 2) !== 0) continue;
    w.player.spawn(tx * TILE, ty * TILE);
    return { tx, ty, seg: seg.name };
  }
  return null;
}, process.env.SEG ?? 'meatgrinder');
if (placed === null) throw new Error('no ground found to stand on');
await page.waitForTimeout(420);

// A pile of bodies climbing toward the hazard: what a level looks like
// mid-round, once a dozen people have died at the same jump.
await page.evaluate(() => {
  const w = window.yahia;
  const feet = w.player.y + w.player.h;
  const S = window.yahiaScale;
  const [cw, ch] = window.yahiaSprites.corpse;
  for (let i = 0; i < 5; i++) {
    w.corpses.push({
      x: w.player.x + S * 45 + i * S * 27, y: feet - S * 15 - i * S * 12,
      w: cw, h: ch, born: w.timeMs - i * 2600, where: 'scene',
    });
  }
});
await page.waitForTimeout(50);

await page.screenshot({ path: OUT });
const s = await page.evaluate(() => ({
  grounded: window.yahia.player.grounded,
  alive: window.yahia.player.alive,
  vx: Math.round(window.yahia.player.vx),
}));
console.log(`wrote ${OUT} — at ${placed.seg}, grounded=${s.grounded} alive=${s.alive} vx=${s.vx}`);
await browser.close();
