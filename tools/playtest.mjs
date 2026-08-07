/**
 * Automated feel harness.
 *
 * Drives the real build in a real browser and measures the things the
 * prototype was built to answer: does the player move, does death leave a
 * usable body, does sliding down a slope actually bank speed, and is a
 * slide-jump genuinely longer than a standing jump.
 */
// Resolved at runtime so the harness works with a local or a global Playwright.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const URL = process.env.URL ?? 'http://localhost:4173/#seed=yahia';
const SHOT_DIR = process.env.SHOT_DIR ?? '.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(400);

// Every threshold below is expressed in the 480x270 authoring base and scaled,
// so changing SCALE never invalidates the suite.
const SCALE = await page.evaluate(() => window.yahiaScale);
const px = (base) => base * SCALE;
const TILE = px(16);
console.log(`render scale ${SCALE}x — ${px(480)}x${px(270)}, ${TILE}px tiles\n`);

const state = () =>
  page.evaluate(() => {
    const w = window.yahia;
    return {
      x: w.player.x,
      y: w.player.y,
      vx: w.player.vx,
      vy: w.player.vy,
      h: w.player.h,
      grounded: w.player.grounded,
      sliding: w.player.sliding,
      alive: w.player.alive,
      finished: w.player.finished,
      deaths: w.deaths,
      corpses: w.corpses.length,
      used: w.corpsesUsed.size,
      topSpeed: w.topSpeed,
      levelW: w.level.pxWidth,
      goalX: w.level.goalX,
      segments: w.level.placed.length,
      checkpoints: w.level.checkpoints.length,
    };
  });

// --- level built sanely ----------------------------------------------------
const start = await state();
check('level generated', start.levelW > px(2000) && start.segments > 20,
  `${start.segments} segments, ${start.levelW}px, ${start.checkpoints} checkpoints`);
check('goal placed', start.goalX > 0, `goalX=${start.goalX}`);

// --- auto-run --------------------------------------------------------------
await sleep(1000);
const ran = await state();
check('auto-runs forward', ran.x > start.x + px(60), `moved ${Math.round(ran.x - start.x)}px in 1s`);

// --- jump ------------------------------------------------------------------
await page.evaluate(() => window.yahia.player.spawn(window.yahia.level.checkpoints[0].x, window.yahia.level.checkpoints[0].y));
await sleep(300);
const beforeJump = await state();
await page.keyboard.down('Space');
await sleep(120);
const midJump = await state();
await page.keyboard.up('Space');
check('jump lifts the player', midJump.y < beforeJump.y - px(10),
  `rose ${Math.round(beforeJump.y - midJump.y)}px`);
await sleep(600);

// --- slide shrinks the hitbox ---------------------------------------------
await page.keyboard.down('ArrowDown');
await sleep(200);
const sliding = await state();
check('slide halves the hitbox', sliding.h === px(14) && sliding.sliding, `h=${sliding.h}`);
await page.keyboard.up('ArrowDown');
await sleep(300);
const stood = await state();
check('stands back up', stood.h === px(20), `h=${stood.h}`);

// --- the momentum claim: sliding a slope banks speed ------------------------
// This is the design's central mechanical promise. If sliding a descent does
// not out-run simply running it, the race is pure attrition and the whole
// skill model collapses.
async function placeOnSlope() {
  return page.evaluate(() => {
    const w = window.yahia;
    const seg =
      w.level.placed.find((p) => p.name === 'descent') ??
      w.level.placed.find((p) => p.name === 'stairs');
    if (!seg) return false;
    const TILE = window.yahiaScale * 16;
    const tx = Math.floor(seg.x / TILE) + 1;
    let ty = 0;
    while (ty < w.level.h && w.level.get(tx, ty) === 0) ty++;
    w.player.spawn(tx * TILE + window.yahiaScale * 2, ty * TILE);
    return true;
  });
}

// Sampled inside the page on rAF: a slope is crossed in a few hundred
// milliseconds, and round-tripping every 70ms misses the peak entirely.
async function peakSpeedOverSlope(useSlide) {
  await placeOnSlope();
  return page.evaluate(
    (slide) =>
      new Promise((resolve) => {
        const w = window.yahia;
        const input = window.yahiaInput;
        input.slideHeld = slide;
        let peak = 0;
        const until = performance.now() + 1400;
        const tick = () => {
          if (w.player.alive) peak = Math.max(peak, w.player.vx);
          if (performance.now() < until) requestAnimationFrame(tick);
          else {
            input.slideHeld = false;
            resolve(peak);
          }
        };
        requestAnimationFrame(tick);
      }),
    useSlide,
  );
}

if (await placeOnSlope()) {
  const running = await peakSpeedOverSlope(false);
  const sliding = await peakSpeedOverSlope(true);
  check('sliding a descent out-runs running it', sliding > running + 10,
    `slide peak ${Math.round(sliding)} vs run peak ${Math.round(running)}`);
  check('slide banks speed above base', sliding > px(150) * 1.1,
    `peak ${Math.round(sliding)} vs base ${px(150)}`);
} else {
  check('descent segment present in track', false, 'no descent/stairs segment generated');
}

// --- death leaves a body ----------------------------------------------------
// Drive a genuine death (fall out of the world) so the real code path runs;
// setting `alive = false` from outside would skip World.onDeath entirely.
const corpseTest = await page.evaluate(async () => {
  const w = window.yahia;
  const before = w.corpses.length;
  w.player.y = w.level.pxHeight + 40;
  await new Promise((r) => setTimeout(r, 400));
  return { before, after: w.corpses.length, deaths: w.deaths };
});
check('death leaves a body', corpseTest.after > corpseTest.before,
  `${corpseTest.before} -> ${corpseTest.after} corpses`);

// --- bodies are solid, including suspended in mid-air -----------------------
const standsOnCorpse = await page.evaluate(async () => {
  const w = window.yahia;
  const L = w.level;
  const TILE = window.yahiaScale * 16;
  const [cw, ch] = window.yahiaSprites.corpse;

  // Two adjacent columns with three clear rows above solid ground: a
  // deterministic pocket of open air wide enough to hang a body in.
  let spot = null;
  const clear = (tx, ty) =>
    L.get(tx, ty) === 0 && L.get(tx, ty + 1) === 0 && L.get(tx, ty + 2) === 0;
  for (let tx = 24; tx < L.w - 6 && spot === null; tx++) {
    for (let ty = 2; ty < L.h - 4; ty++) {
      if (clear(tx, ty) && clear(tx + 1, ty) && L.get(tx, ty + 3) === 1) {
        spot = { tx, ty };
        break;
      }
    }
  }
  if (spot === null) return null;

  const corpse = {
    x: spot.tx * TILE, y: (spot.ty + 3) * TILE - ch,
    w: cw, h: ch, born: w.timeMs, where: 'test',
  };
  w.corpses.push(corpse);
  w.player.spawn(corpse.x + window.yahiaScale * 3, corpse.y - window.yahiaScale * 4);

  // Sample the landing frame, not some later one: the runner never stops, so
  // by 350ms it has already crossed a 20px body and moved on.
  let feet = null;
  const deadline = performance.now() + 600;
  while (performance.now() < deadline) {
    if (w.player.grounded) { feet = w.player.y + w.player.h; break; }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { feet, top: corpse.y, used: w.corpsesUsed.size };
});
if (standsOnCorpse === null) {
  check('open-air pocket found for corpse test', false, 'no suitable column in track');
} else {
  check('bodies are solid platforms',
    standsOnCorpse.feet !== null && Math.abs(standsOnCorpse.feet - standsOnCorpse.top) < 3,
    `landed feet=${Math.round(standsOnCorpse.feet ?? -1)} bodyTop=${Math.round(standsOnCorpse.top)}`);
  check('martyr credit recorded', standsOnCorpse.used > 0,
    `bodies used=${standsOnCorpse.used}`);
}

// --- respawn ---------------------------------------------------------------
await page.evaluate(() => { window.yahia.player.y = window.yahia.level.pxHeight + 40; });
await sleep(1600);
const revived = await state();
check('respawns after death', revived.alive, `alive=${revived.alive}`);

// --- long unattended run: no crashes, no permanent stalls -------------------
await page.evaluate(() => window.yahia.reset());
let stuck = 0;
let prevX = 0;
for (let i = 0; i < 20; i++) {
  await page.keyboard.down('Space');
  await sleep(90);
  await page.keyboard.up('Space');
  await sleep(210);
  const s = await state();
  if (s.x <= prevX + 1 && s.alive) stuck++;
  prevX = s.x;
}
check('never permanently stalls', stuck < 6, `${stuck}/20 sampled windows without progress`);

// --- creatures are lethal ---------------------------------------------------
const enemyKill = await page.evaluate(async () => {
  const w = window.yahia;
  const list = w.level.enemies;
  if (list.length === 0) return { count: 0 };
  const e = list[0];
  // Stand the runner exactly where the creature is; it must not survive.
  w.player.spawn(e.x, e.y);
  await new Promise((r) => setTimeout(r, 120));
  return { count: list.length, alive: w.player.alive, kind: e.kind };
});
if (enemyKill.count === 0) {
  check('creatures placed in the track', false, 'level generated none');
} else {
  check('creatures placed in the track', true, `${enemyKill.count} across the track`);
  check('touching a creature kills', enemyKill.alive === false,
    `stood on a ${enemyKill.kind}, alive=${enemyKill.alive}`);
}

// --- frame rate -------------------------------------------------------------
// 1920x1080 Canvas2D is the real risk of scaling up twice. Headless Chromium on
// a server is NOT a phone, so this only catches a catastrophic regression —
// the honest measurement still has to happen on a real device.
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
check('sustains 60fps headless', fps > 50, `${fps.toFixed(0)} fps at ${px(480)}x${px(270)} (not a phone)`);

const final = await state();
check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

// --- visual check: the staircase, in front of a hazard ----------------------
await page.evaluate(() => {
  const w = window.yahia;
  w.reset();
  const seg =
    w.level.placed.find((p) => p.name === 'meatgrinder') ??
    w.level.placed.find((p) => p.name === 'spikes') ??
    w.level.placed[6];
  const tx = Math.floor(seg.x / 16);
  let ty = 0;
  while (ty < w.level.h && w.level.get(tx, ty) === 0) ty++;
  w.player.spawn(seg.x - 140, ty * 16 - 4);
});
// Let the camera catch up before composing the shot.
await sleep(700);
await page.evaluate(() => {
  const w = window.yahia;
  const feet = w.player.y + w.player.h;
  // The pile of bodies at the hard bit: what a level looks like mid-round.
  for (let i = 0; i < 5; i++) {
    w.corpses.push({
      x: w.player.x + 40 + i * 26, y: feet - 14 - i * 11,
      w: 20, h: 10, born: w.timeMs - i * 2600, where: 'scene',
    });
  }
});
await sleep(40);
await page.screenshot({ path: `${SHOT_DIR}/shot-scene.png` });

await page.evaluate(() => window.yahia.reset());
await sleep(500);
await page.screenshot({ path: `${SHOT_DIR}/shot-start.png` });

console.log(`\nfinal: x=${Math.round(final.x)} deaths=${final.deaths} corpses=${final.corpses} topSpeed=${Math.round(final.topSpeed)}`);
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
