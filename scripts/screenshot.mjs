#!/usr/bin/env node
/**
 * Browser smoke test + screenshots. Requires a running server (and ideally
 * bots for a lively room):
 *
 *   node scripts/screenshot.mjs [baseUrl=http://localhost:8080] [outDir=docs]
 *
 * Verifies: join flow, clicking, buying, steal popover + steal, boss key.
 * Exits non-zero on console errors or failed steps.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = process.argv[2] ?? 'http://localhost:8080';
const outDir = process.argv[3] ?? 'docs';
fs.mkdirSync(outDir, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(baseUrl);

// --- Join flow ------------------------------------------------------------
await page.waitForSelector('.modal input[type="text"]', { timeout: 5000 });
await page.fill('.modal input[type="text"]', 'Du');
await page.screenshot({ path: `${outDir}/join.png` });
await page.click('.modal .actions .btn.gold');
await page.waitForSelector('.modal', { state: 'detached', timeout: 5000 });
await page.waitForTimeout(2000);

// --- Click + buy ------------------------------------------------------------
for (let i = 0; i < 30; i++) {
  await page.click('#btn-click', { delay: 10 });
  await page.waitForTimeout(25);
}
await page.waitForTimeout(500);
const firstGen = page.locator('#gen-list .gen').first();
if (await firstGen.isEnabled()) await firstGen.click();
await page.waitForTimeout(1000);
const bpText = await page.textContent('#bp-value');
const gens = await page.evaluate(() => window.__kr.store.you?.gens);
console.log('HUD bp:', bpText, 'gens:', JSON.stringify(gens));
if (!gens || gens[0] < 1) {
  errors.push('buying a pencil did not register');
}

// --- Steal popover ----------------------------------------------------------
const target = await page.evaluate(() => {
  const { store, scene } = window.__kr;
  const other = [...store.roster.values()].find((p) => p.online && p.id !== store.you?.id);
  if (!other) return null;
  return { id: other.id, name: other.name, ...scene.screenPosOfSeat(other.seat) };
});
let stole = false;
if (target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForSelector('#popover-root .popover', { timeout: 3000 });
  await page.screenshot({ path: `${outDir}/steal.png` });
  const stealBtn = page.locator('#popover-root .popover .btn');
  if (await stealBtn.isEnabled()) {
    const before = await page.evaluate(() => window.__kr.store.you?.stolenTotal ?? 0);
    await stealBtn.click();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.__kr.store.you?.stolenTotal ?? 0);
    stole = after > before;
    console.log('steal: stolenTotal', before, '->', after);
    if (!stole) errors.push('steal did not increase stolenTotal');
  } else {
    console.log('steal button disabled (cooldown/patrol?)');
  }
} else {
  console.log('no other online player found; skipping steal check');
}

// --- Main screenshot (board in frame) ---------------------------------------
await page.mouse.move(400, 300);
await page.mouse.wheel(0, -3000);
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/screenshot.png` });

// --- Event banner (server may be running with fast events) -------------------
const sawEvent = await page
  .waitForSelector('#event-banner:not(.hidden)', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
if (sawEvent) {
  const evText = await page.textContent('#event-text');
  console.log('event:', evText);
  await page.screenshot({ path: `${outDir}/event.png` });
}

// --- Boss key ----------------------------------------------------------------
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const title = await page.title();
console.log('boss title:', title);
if (title !== 'Mathe – Notizen' && title !== 'Math – Notes') {
  errors.push(`boss key title unexpected: ${title}`);
}
await page.screenshot({ path: `${outDir}/boss.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

await browser.close();

if (errors.length > 0) {
  console.error('FAILURES / CONSOLE ERRORS:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log(`screenshots written to ${outDir}/, no console errors`);
