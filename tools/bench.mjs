/**
 * Mobile cost check.
 *
 * Two questions this answers:
 *  1. How much frame budget does the current internal resolution cost when the
 *     CPU is throttled to something phone-shaped?
 *  2. How many pixels are we rendering that the device physically cannot show?
 *
 * Caveat worth stating plainly: headless Chromium is not a phone. Canvas2D fill
 * is largely GPU-bound and this box's GPU path is nothing like a Mali or an
 * Adreno. Treat throttled FPS as a relative signal between configurations, not
 * as an absolute frame rate anyone will see.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const URL = process.env.URL ?? 'http://127.0.0.1:4173/#seed=yahia';

/** Landscape phones we actually care about, in CSS px and device pixel ratio. */
const DEVICES = [
  { name: 'iPhone 15 (flagship)', w: 852, h: 393, dpr: 3 },
  { name: 'Pixel 7a (mid)', w: 839, h: 391, dpr: 2.6 },
  { name: 'Budget Android', w: 740, h: 360, dpr: 2 },
];

const browser = await chromium.launch();

async function fpsAt(throttle, device) {
  const page = await browser.newPage({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: device.dpr,
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(300);
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          const dt = performance.now() - t0;
          if (dt < 2500) requestAnimationFrame(tick);
          else resolve((frames * 1000) / dt);
        };
        requestAnimationFrame(tick);
      }),
  );
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { bufW: c.width, bufH: c.height };
  });
  await page.close();
  return { fps, ...info };
}

const first = await fpsAt(1, DEVICES[0]);
console.log(`internal buffer: ${first.bufW}x${first.bufH} (${(first.bufW * first.bufH / 1e6).toFixed(2)} Mpx)\n`);

console.log('device pixels actually available (landscape, object-fit: contain):');
for (const d of DEVICES) {
  const devH = Math.round(d.h * d.dpr);
  const devW = Math.round(d.w * d.dpr);
  const scale = devH / first.bufH;
  const verdict =
    scale >= 0.98 ? `upscaled ${scale.toFixed(2)}x — sharp` : `DOWNSCALED ${scale.toFixed(2)}x — ${Math.round((1 - scale * scale) * 100)}% of pixels wasted`;
  console.log(`  ${d.name.padEnd(22)} ${devW}x${devH}  ${verdict}`);
}

console.log('\nthrottled frame rate:');
for (const rate of [1, 4, 6]) {
  const r = await fpsAt(rate, DEVICES[1]);
  const label = rate === 1 ? 'unthrottled' : `${rate}x CPU slowdown`;
  console.log(`  ${label.padEnd(22)} ${r.fps.toFixed(1)} fps`);
}

// Per-stage cost by elimination. Timing the calls is useless — Canvas2D queues
// work, so a stage can issue in 0.3ms and cost the whole frame to rasterise.
// Nulling a stage and re-measuring frame rate is the only honest read.
console.log('\ncost per draw stage (4x throttle, fps with the stage removed):');
const device = DEVICES[1];
async function fpsWithout(stage) {
  const page = await browser.newPage({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: device.dpr,
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate((name) => {
    if (name) window.yahiaRenderer[name] = function () {};
  }, stage);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(250);
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          const dt = performance.now() - t0;
          if (dt < 2000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / dt);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.close();
  return fps;
}
const baseline = await fpsWithout(null);
console.log(`  ${'baseline'.padEnd(22)} ${baseline.toFixed(1)} fps`);
for (const stage of ['drawSky', 'drawTowers', 'drawTiles', 'drawCorpses', 'drawPlayer']) {
  const f = await fpsWithout(stage);
  const gain = f - baseline;
  const flag = gain > 8 ? '   <-- dominant cost' : '';
  console.log(`  ${('without ' + stage).padEnd(22)} ${f.toFixed(1)} fps  (+${gain.toFixed(1)})${flag}`);
}

await browser.close();
