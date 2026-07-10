#!/usr/bin/env node
/**
 * Generate CrazyGames marketing assets: 3 cover images + 2 preview videos.
 *
 *   node scripts/marketing/generate.mjs [baseUrl=http://localhost:8080]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'docs/crazygames');
const COVER_HTML = path.join(HERE, 'cover.html');
const baseUrl = process.argv[2] ?? 'http://localhost:8080';

fs.mkdirSync(OUT, { recursive: true });

const COVERS = [
  { layout: 'landscape', width: 1920, height: 1080, file: 'cover-landscape-1920x1080.png' },
  { layout: 'portrait', width: 800, height: 1200, file: 'cover-portrait-800x1200.png' },
  { layout: 'square', width: 800, height: 800, file: 'cover-square-800x800.png' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function framesToMp4(framesDir, mp4Path, { width, height, fps = 1 }) {
  const count = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length;
  if (count === 0) throw new Error(`no frames in ${framesDir}`);
  await run('ffmpeg', [
    '-y',
    '-framerate',
    String(fps),
    '-i',
    path.join(framesDir, 'frame-%03d.png'),
    '-t',
    '18',
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x211d18`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    mp4Path,
  ]);
}

async function renderCovers(browser) {
  console.log('Rendering cover images…');
  for (const spec of COVERS) {
    const page = await browser.newPage({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`file://${COVER_HTML}?layout=${spec.layout}`);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(OUT, spec.file),
      type: 'png',
      animations: 'disabled',
    });
    await withTimeout(page.close(), 5000, 'close cover page');
    console.log('  ✓', spec.file);
  }
}

async function joinAndPlay(page, name) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const hasModal = await page
    .waitForSelector('.modal input[type="text"]', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (hasModal) {
    await page.fill('.modal input[type="text"]', name);
    await page.click('.modal .actions .btn.gold');
    await page
      .waitForFunction(() => window.__kr?.store?.you, { timeout: 12000 })
      .catch(() => console.warn('  (join slow — continuing)'));
  }
  await page.waitForTimeout(600);
}

async function capturePreview(browser, { width, height, outfile, label }) {
  console.log(`Recording ${label} preview…`);
  const framesDir = path.join(OUT, `.frames-${label}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  try {
    await joinAndPlay(page, `Vid${label}`);

    let frame = 0;
    const snap = async () => {
      const n = String(++frame).padStart(3, '0');
      await page.screenshot({ path: path.join(framesDir, `frame-${n}.png`), type: 'png' });
    };

    await snap();

    for (let i = 0; i < 40; i++) {
      await page.click('#btn-click', { timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(90);
      if (i % 2 === 1) await snap();
    }

    const gen = page.locator('#gen-list .gen').first();
    if (await gen.isEnabled({ timeout: 1000 }).catch(() => false)) {
      await gen.click();
      await page.waitForTimeout(400);
      await snap();
    }

    await page.mouse.move(width / 2, height / 2);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(180);
    }
    await snap();

    const target = await page.evaluate(() => {
      const api = window.__kr;
      if (!api) return null;
      const { store, scene } = api;
      const other = [...store.roster.values()].find((p) => p.online && p.id !== store.you?.id);
      return other ? scene.screenPosOfSeat(other.seat) : null;
    });
    if (target) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(400);
      await snap();
      const stealBtn = page.locator('#popover-root .popover .btn');
      if (await stealBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
        await stealBtn.click();
        await page.waitForTimeout(600);
        await snap();
      }
    }

    for (let i = 0; i < 12; i++) {
      await page.click('#btn-click', { timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(90);
    }
    await snap();
  } finally {
    await withTimeout(page.close(), 5000, `close ${label} page`).catch(() => {});
  }

  await framesToMp4(framesDir, path.join(OUT, outfile), { width, height });
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log('  ✓', outfile);
}

async function waitForServer(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not reachable at ${url}`);
}

async function main() {
  console.log('Waiting for game server…');
  await waitForServer(baseUrl);

  const browser = await chromium.launch();
  await renderCovers(browser);

  await capturePreview(browser, {
    width: 1920,
    height: 1080,
    outfile: 'preview-landscape.mp4',
    label: 'landscape',
  });

  await capturePreview(browser, {
    width: 1080,
    height: 1620,
    outfile: 'preview-portrait.mp4',
    label: 'portrait',
  });

  await browser.close();

  console.log('\nAll assets written to', OUT);
  for (const f of fs.readdirSync(OUT).sort()) {
    const stat = fs.statSync(path.join(OUT, f));
    if (stat.isFile()) {
      const mb = (stat.size / (1024 * 1024)).toFixed(2);
      console.log(`  ${f} (${mb} MB)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
