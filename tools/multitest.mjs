/**
 * Three real browsers in one room, against the real room server.
 *
 * The parts of multiplayer that break quietly are the ones a single client
 * cannot see: everyone racing a different track, a body only some players can
 * stand on, a race that never ends. So this drives three actual clients through
 * the whole flow — name, kit, ready, race, finish — and asserts what the design
 * promises rather than what the code happens to do.
 *
 *   npm run room &   npm run preview &   npm run multitest
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const APP = process.env.URL ?? 'http://127.0.0.1:4173';
const ROOM = process.env.ROOM ?? 'ws://127.0.0.1:8787';
const CODE = `T${Date.now().toString(36).slice(-4).toUpperCase()}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const NAMES = ['ALFA', 'BRAVO', 'CHARLIE'];
const pages = [];
const errors = [];

for (let i = 0; i < NAMES.length; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${NAMES[i]}: ${e}`));
  await page.goto(`${APP}/?room=${encodeURIComponent(ROOM)}&r=${CODE}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#play', { timeout: 15000 });
  await page.fill('#name', NAMES[i]);
  // A different outfit each, which is the entire point of the picker.
  await page.locator('.kit').nth(i * 3).click();
  pages.push(page);
  await sleep(150);
}

// --- the lobby ---------------------------------------------------------------
await sleep(600);
const seenByFirst = await pages[0].locator('.roster-line').count();
check('everyone in the room sees everyone', seenByFirst === 3, `${seenByFirst} of 3 on ALFA's roster`);

const label = await pages[0].locator('#play').textContent();
check('the button is READY, not PLAY', label.trim() === 'READY', `button says "${label.trim()}"`);

// --- ready ------------------------------------------------------------------
await pages[0].click('#play');
await pages[1].click('#play');
await sleep(400);
const startedEarly = await pages[0].evaluate(() => window.yahiaRoom?.phase);
check('the race waits for the last player', startedEarly === 'lobby', `phase=${startedEarly}`);

await pages[2].click('#play');
await sleep(800);

const phases = await Promise.all(pages.map((p) => p.evaluate(() => window.yahiaRoom?.phase)));
check('all ready starts the race', phases.every((p) => p === 'racing'), phases.join(', '));

const seeds = await Promise.all(pages.map((p) => p.evaluate(() => window.yahia.seed)));
check('everyone races the same track', new Set(seeds).size === 1, `seed ${seeds[0]}`);

// --- ghosts -----------------------------------------------------------------
await sleep(1200);
const ghosts = await pages[0].evaluate(() => window.yahia.ghosts.length);
check('rivals appear as ghosts', ghosts === 2, `${ghosts} ghosts (2 rivals)`);

// Names ride on the roster, not the position stream, so this is a join that
// could silently produce blank tags without anything else noticing.
const named = await pages[0].evaluate(() =>
  window.yahia.ghosts.map((g) => g.name).sort().join(','),
);
check('every rival is labelled', named === 'BRAVO,CHARLIE', named || '(blank)');

const mine = await pages[0].evaluate(() => window.yahia.me?.name ?? null);
check('your own runner is labelled too', mine === 'ALFA', `${mine}`);

// --- a body is solid to everybody -------------------------------------------
const before = await pages[1].evaluate(() => window.yahia.corpses.length);
await pages[0].evaluate(() => {
  // Kill ALFA through the real path — dropping him out of the world — rather
  // than by setting a flag, which skips the death handler entirely.
  window.yahia.player.y = window.yahia.level.pxHeight + 500;
});
await sleep(700);
const after = await pages[1].evaluate(() => window.yahia.corpses.length);
check("a rival's death leaves a body you can stand on", after > before, `${before} -> ${after} corpses`);

// --- the finish -------------------------------------------------------------
// Teleport the first two home. The race must NOT end on two.
for (const p of pages.slice(0, 2)) {
  await p.evaluate(() => {
    const w = window.yahia;
    w.player.spawn(w.level.goalX + 8, w.level.checkpoints[0].y);
  });
  await sleep(500);
}
await sleep(600);
const afterTwo = await pages[2].evaluate(() => window.yahiaRoom?.phase);
check('two finishers do not end the race', afterTwo === 'racing', `phase=${afterTwo}`);

// The runner still out there has to be able to see how close it is to over.
const standing = await pages[2].evaluate(() => {
  const r = window.yahia.race;
  return r === null ? 'none' : `${r.home}/${r.ends}`;
});
check('the last runner can see two are home', standing === '2/3', standing);

// The count says the race moved on; only a name says who moved it.
const notice = await pages[2].evaluate(() => window.yahia.notice?.text ?? null);
check(
  'an arrival is announced by name',
  typeof notice === 'string' && notice.includes('BRAVO'),
  `${notice}`,
);

await pages[2].evaluate(() => {
  const w = window.yahia;
  w.player.spawn(w.level.goalX + 8, w.level.checkpoints[0].y);
});
await sleep(1200);

const over = await Promise.all(pages.map((p) => p.evaluate(() => window.yahiaRoom?.phase)));
check('the third finisher ends it for everyone', over.every((p) => p === 'over'), over.join(', '));

const board = await pages[0].locator('.roster-line.done').count();
check('the finish order is shown', board === 3, `${board} placings listed`);

check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
