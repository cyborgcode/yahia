/**
 * A picture of the lobby with a room full of people in it.
 *
 * Layout arguments are settled by looking, not by reasoning about box widths —
 * three names, three kits and a room code is the state the panel actually has
 * to survive, and it is the one state a single client can never show you.
 *
 *   npm run room &  npm run preview &  npm run lobbyshot
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const APP = process.env.URL ?? 'http://127.0.0.1:4173';
const ROOM = process.env.ROOM ?? 'ws://127.0.0.1:8787';
const OUT = process.env.OUT ?? 'lobby.png';
const CODE = `L${Date.now().toString(36).slice(-4).toUpperCase()}`;
const NAMES = ['RAYEN', 'ABDERRAHMAN', 'ALFA'];

const browser = await chromium.launch();
const pages = [];
for (let i = 0; i < NAMES.length; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/?room=${encodeURIComponent(ROOM)}&r=${CODE}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#play', { timeout: 15000 });
  await page.fill('#name', NAMES[i]);
  await page.locator('.kit').nth(i * 4).click();
  pages.push(page);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.PHASE === 'race') {
  // Everyone racing, and parked on top of each other so the nameplates have to
  // survive the crowded case rather than the tidy one.
  for (const p of pages) await p.click('#play');
  await sleep(1400);
  const spots = [60, 20, -30];
  for (let i = 0; i < pages.length; i++) {
    await pages[i].evaluate((dx) => {
      const w = window.yahia;
      w.player.x = w.player.x + dx;
    }, spots[i]);
  }
  await sleep(400);
} else if (process.env.PHASE === 'over') {
  // The same panel holds the finish board, so it has to be looked at too.
  for (const p of pages) await p.click('#play');
  // Let the race actually be running before anyone crosses the line: a finish
  // is only banked from a live runner, and teleporting one into the goal
  // before the first frames have gone by simply drops him through the world.
  await sleep(2000);
  for (const p of pages) {
    await p.evaluate(() => {
      const w = window.yahia;
      w.player.spawn(w.level.goalX + 8, w.level.checkpoints[0].y);
    });
    await sleep(600);
  }
  await sleep(1400);
} else {
  // Two of three ready, so both roster states are in the same picture.
  await pages[1].click('#play');
  await pages[2].click('#play');
  await sleep(700);
}

await pages[0].screenshot({ path: OUT });
console.log(`wrote ${OUT}`);
await browser.close();
