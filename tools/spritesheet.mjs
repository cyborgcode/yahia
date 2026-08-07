/**
 * Renders the authored sprites to a PNG contact sheet so they can be looked at
 * and iterated on. Validates row rectangularity and palette coverage first —
 * hand-written ASCII art gets miscounted, and a ragged row is invisible in code
 * but obvious in the render.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const URL = process.env.URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? './spritesheet.png';
const SCALE = Number(process.env.SCALE ?? 7);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// The atlas image must be in the DOM for the preview to sample it.
await page.evaluate(async () => {
  const { manifest } = window.yahiaSprites;
  const img = new Image();
  img.id = 'atlas-preview';
  const url = [...document.querySelectorAll('script')]
    .map((s) => s.src)
    .join(' ');
  void url;
  img.src = manifest.imageUrl;
  document.body.append(img);
  await img.decode();
});

const problems = await page.evaluate(() => window.yahiaSprites.validate());
if (problems.length > 0) {
  console.log('SPRITE PROBLEMS:');
  for (const p of problems) console.log('  ' + p);
} else {
  console.log('sprite data OK — all rows rectangular, all chars in palette');
}

const dims = await page.evaluate(
  (scale) => {
    const { manifest } = window.yahiaSprites;
    const names = Object.keys(manifest.frames);
    const cols = 6;
    const maxW = Math.max(...names.map((n) => manifest.frames[n][2]));
    const maxH = Math.max(...names.map((n) => manifest.frames[n][3]));
    const cellW = (maxW + 6) * scale;
    const cellH = (maxH + 4) * scale + 22;
    const rows = Math.ceil(names.length / cols);

    const c = document.createElement('canvas');
    c.width = cols * cellW;
    c.height = rows * cellH + 34;
    c.id = 'sheet';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#150f1b';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#f2e3c4';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillText('YAHIA — ATLAS FRAMES', 12, 22);

    const atlas = document.querySelector('#atlas-preview');
    names.forEach((name, i) => {
      const [sx, sy, sw, sh] = manifest.frames[name];
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * cellH + 34;

      for (let y = 0; y < cellH - 22; y += 8) {
        for (let x = 0; x < cellW; x += 8) {
          ctx.fillStyle = ((x + y) / 8) % 2 === 0 ? '#221a2a' : '#1b1422';
          ctx.fillRect(cx + x, cy + y, 8, 8);
        }
      }

      const ox = cx + Math.floor((cellW - sw * scale) / 2);
      const oy = cy + (cellH - 22 - sh * scale);
      ctx.drawImage(atlas, sx, sy, sw, sh, ox, oy, sw * scale, sh * scale);

      ctx.fillStyle = '#8a7c93';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(`${name}  ${sw}x${sh}`, cx + 6, cy + cellH - 8);
    });

    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.append(c);
    return { width: c.width, height: c.height };
  },
  SCALE,
);

await page.setViewportSize(dims);
await page.locator('#sheet').screenshot({ path: OUT });
console.log(`wrote ${OUT} (${dims.width}x${dims.height})`);
await browser.close();
