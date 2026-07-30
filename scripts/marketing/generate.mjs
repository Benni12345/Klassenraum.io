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

/**
 * Stylized gloved-hand pointer. CrazyGames does not allow the default OS cursor
 * or a mobile tap indicator in cover videos, so the real cursor is hidden and
 * this follows the synthetic mouse instead.
 */
const GLOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36"><path d="M11 2c1.7 0 3 1.3 3 3v11h1.5c.8-1.2 2.2-2 3.8-2 1 0 1.9.3 2.7.8.6-.5 1.4-.8 2.3-.8 2 0 3.7 1.6 3.7 3.6v7.2C28 30.1 24.1 34 19.3 34h-4.6C10.4 34 7 30.6 7 26.4V17l-2.6 2.6c-1 1-2.6 1-3.5 0-1-1-1-2.6 0-3.5L8 9V5c0-1.7 1.3-3 3-3z" fill="#fdf6e3" stroke="#26221c" stroke-width="2" stroke-linejoin="round"/></svg>`;

const PROMO_STYLE = `
  *, *::before, *::after { cursor: none !important; -webkit-tap-highlight-color: transparent !important; }
  *:focus, *:focus-visible { outline: none !important; }
  /* Onboarding UI has no place in a cover video. */
  .tut-card, .hint-arrow, #hint-root { display: none !important; }
  #promo-cursor {
    position: fixed;
    width: 30px;
    height: 36px;
    margin: -4px 0 0 -6px;
    z-index: 2147483647;
    pointer-events: none;
    opacity: 0;
    transition: transform 0.06s ease-out;
    background: no-repeat center/contain url('data:image/svg+xml;utf8,${encodeURIComponent(GLOVE_SVG)}');
    filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.45));
  }
  #promo-cursor.down { transform: scale(0.82); }
`;

const PROMO_SCRIPT = `
  const cursor = document.createElement('div');
  cursor.id = 'promo-cursor';
  document.body.appendChild(cursor);
  addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    cursor.style.opacity = '1';
  }, true);
  addEventListener('mousedown', () => cursor.classList.add('down'), true);
  addEventListener('mouseup', () => cursor.classList.remove('down'), true);
`;

async function joinAndPlay(page, name) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    // English UI, tutorial and hints already seen: the video shows gameplay only.
    localStorage.setItem(
      'kr_prefs',
      JSON.stringify({
        lang: 'en',
        music: true,
        sfx: true,
        tutorialDone: true,
        hints: ['click', 'gen', 'upgrade', 'prestige'],
      }),
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: PROMO_STYLE });
  await page.addScriptTag({ content: PROMO_SCRIPT });
  const hasModal = await page
    .waitForSelector('.modal input[type="text"]', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (hasModal) {
    await page.fill('.modal input[type="text"]', name);
    await page.click('.modal .modal-foot .btn.gold');
    await page
      .waitForFunction(() => window.__kr?.store?.you, { timeout: 12000 })
      .catch(() => console.warn('  (join slow — continuing)'));
  }
  await page.waitForTimeout(600);
}

/** Branded opening frame so every cover video carries the Classroom.io title. */
async function renderTitleFrame(browser, framesDir, { width, height, layout }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`file://${COVER_HTML}?layout=${layout}`);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(framesDir, 'frame-001.png'),
    type: 'png',
    animations: 'disabled',
  });
  await withTimeout(page.close(), 5000, 'close title frame page');
}

async function capturePreview(browser, { width, height, outfile, label, layout }) {
  console.log(`Recording ${label} preview…`);
  const framesDir = path.join(OUT, `.frames-${label}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  // frame-001 is the branded title card; gameplay frames follow.
  await renderTitleFrame(browser, framesDir, { width, height, layout });

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  try {
    await joinAndPlay(page, `Vid${label}`);

    let frame = 1;
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
    layout: 'landscape',
  });

  await capturePreview(browser, {
    width: 1080,
    height: 1620,
    outfile: 'preview-portrait.mp4',
    label: 'portrait',
    layout: 'portrait',
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
