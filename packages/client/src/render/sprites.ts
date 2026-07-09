import type { AvatarSpec } from '@shared/types';

/**
 * All pixel art is authored in code: string maps -> offscreen canvases.
 * '.' = transparent, letters = palette entries. Everything renders at
 * logical-pixel resolution and is scaled up with imageSmoothing disabled.
 */

export const SKINS = ['#f6d7b0', '#e0b088', '#c1885f', '#8d5a3b'] as const;
export const HAIR_COLORS = ['#2b2118', '#5b3a1e', '#e7c04f', '#c14e2e', '#3f6ad8', '#d95fb8'] as const;
export const SHIRTS = ['#c94f4f', '#4a6bd4', '#3f9e4d', '#d4b23f', '#8a4ad4', '#e07b3a', '#2fa3a3', '#7d8a97'] as const;

export const PAL = {
  wood: '#a97c50',
  woodDark: '#7d5836',
  woodLight: '#c49a6c',
  floor: '#c9a06b',
  floorLine: '#b3894f',
  wall: '#d7e4d0',
  wallDark: '#b6c9b4',
  board: '#2f5d46',
  boardDark: '#264b39',
  frame: '#6e4a2f',
  chalk: '#eef3ea',
  chalkDim: '#b7cbb9',
  sky: '#9fd4e8',
  cloud: '#ffffff',
  ink: '#26221c',
  paper: '#f5efdc',
  gold: '#e8b23a',
  red: '#c94f4f',
  metal: '#8f9aa5',
  metalDark: '#5f6a75',
} as const;

export function px(rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      const color = pal[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

// ---------------------------------------------------------------------------
// Student (seen from behind, facing the board)

const HEAD = [
  '....####....',
  '...######...',
  '...######...',
  '...######...',
  '...######...',
  '....####....',
  '.....##.....',
];

const HAIR_STYLES: string[][] = [
  // 0: short
  ['....####....', '...######...', '...######...', '...#....#...'],
  // 1: bob
  ['....####....', '...######...', '...######...', '...##..##...', '...#....#...', '...#....#...'],
  // 2: long (drapes to shoulders)
  [
    '....####....',
    '...######...',
    '...######...',
    '...##..##...',
    '...#....#...',
    '...#....#...',
    '...#....#...',
    '..##....##..',
    '..##....##..',
  ],
  // 3: curly
  ['...######...', '..########..', '..########..', '..##....##..', '...#....#...'],
  // 4: cap (worn backwards, obviously)
  ['....####....', '...######...', '...######...', '....#..#....'],
];

const BODY = [
  '...######...',
  '..########..',
  '.##########.',
  '.##########.',
  '.##########.',
  '.##########.',
];

const studentCache = new Map<string, HTMLCanvasElement>();

/** 12x16, seated student seen from behind. */
export function studentSprite(a: AvatarSpec): HTMLCanvasElement {
  const key = `${a.skin}-${a.hair}-${a.hairColor}-${a.shirt}`;
  const hit = studentCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(12, 16);
  const skin = SKINS[a.skin] ?? SKINS[0];
  const hairC = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const shirt = SHIRTS[a.shirt] ?? SHIRTS[0];
  ctx.drawImage(px(HEAD, { '#': skin }), 0, 1);
  ctx.drawImage(px(HAIR_STYLES[a.hair] ?? HAIR_STYLES[0]!, { '#': hairC }), 0, 0);
  const body = px(BODY, { '#': shirt });
  ctx.drawImage(body, 0, 9);
  // Shade the shirt's bottom row slightly for depth.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(1, 14, 10, 1);
  studentCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Walker (side view, facing left/right), 2 frames

const WALK_HEAD_SIDE = [
  '....####....',
  '...######...',
  '...#o##o#...',
  '...######...',
  '....####....',
];

const WALK_BODY_SIDE = [
  '..########..',
  '.##########.',
  '.##########.',
  '.##########.',
  '..########..',
];

const WALK_LEGS: [string, string][] = [
  ['...##...##..', '..##....##..'],
  ['..##....##..', '...##...##..'],
];

const walkerCache = new Map<string, HTMLCanvasElement>();

/** 12x16 side-view student for aisle walking. */
export function walkerSprite(a: AvatarSpec, frame: number, facing: -1 | 1): HTMLCanvasElement {
  const key = `${a.skin}-${a.hair}-${a.hairColor}-${a.shirt}-${frame}-${facing}`;
  const hit = walkerCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(12, 16);
  const skin = SKINS[a.skin] ?? SKINS[0];
  const hairC = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const shirt = SHIRTS[a.shirt] ?? SHIRTS[0];
  const f = frame & 1;
  ctx.save();
  if (facing < 0) {
    ctx.translate(12, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(px(WALK_HEAD_SIDE, { '#': skin, o: PAL.ink }), 0, 1);
  ctx.drawImage(px(HAIR_STYLES[a.hair]!.slice(0, 4), { '#': hairC }), 0, 0);
  ctx.drawImage(px(WALK_BODY_SIDE, { '#': shirt }), 0, 7);
  const legs = WALK_LEGS[f]!;
  ctx.drawImage(px([legs[0]!], { '#': PAL.ink }), 0, 13);
  ctx.drawImage(px([legs[1]!], { '#': PAL.ink }), 0, 14);
  ctx.restore();
  walkerCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Teacher (front view, facing the class), 2 walk frames

const TEACHER_FRAMES = [0, 1].map((f) =>
  px(
    [
      '...GGGG...',
      '..GGGGGG..',
      '..G####G..',
      '..G#o#o#..',
      '..G####G..',
      '...####...',
      '..DDDDDD..',
      '.DDDDDDDD.',
      '.D.DDDD.D.',
      '.#.DDDD.#.',
      '...DDDD...',
      '..DDDDDD..',
      f === 0 ? '..LL..LL..' : '...LL.LL..',
      f === 0 ? '..LL..LL..' : '..LL..LL..',
      f === 0 ? '..SS..SS..' : '.SS...SS..',
    ],
    {
      G: '#b9b2a6',
      '#': '#e8c39e',
      o: '#26221c',
      D: '#3e6f8e',
      L: '#494540',
      S: '#26221c',
    },
  ),
);

export function teacherSprite(frame: number): HTMLCanvasElement {
  return TEACHER_FRAMES[frame % 2]!;
}

// ---------------------------------------------------------------------------
// Desk + clutter tiers

export const DESK_W = 26;
export const DESK_H = 12;

function baseDesk(): HTMLCanvasElement {
  const [c, ctx] = canvas(DESK_W, DESK_H);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(1, 0, DESK_W - 2, 1);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 1, DESK_W, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 5; i++) ctx.fillRect(3 + i * 5, 2 + (i % 3), 3, 1);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 7, DESK_W, 2);
  ctx.fillRect(2, 9, 2, 3);
  ctx.fillRect(DESK_W - 4, 9, 2, 3);
  return c;
}

const CLUTTER: HTMLCanvasElement[] = [
  // 1 pencil
  px(['....#', 'YYYYG', 'RYYY.'], { Y: '#e7c04f', G: '#4a4a4a', R: '#e88a9a', '#': '#4a4a4a' }),
  // 2 sticky notes
  px(['YY.y', 'YYyy', '.yy.'], { Y: '#f0d858', y: '#e8ef7a' }),
  // 3 calculator
  px(['BBBB', 'BSSB', 'Bkkb', 'BkkB', 'BBBB'], { B: '#3a4148', S: '#9fd4a8', k: '#c9d2da', b: '#c9d2da' }),
  // 4 book stack (study group)
  px(['RRRRRR.', 'BBBBBB.', 'GGGGGG.'], { R: '#c94f4f', B: '#4a6bd4', G: '#3f9e4d' }),
  // 5 cheat sheet
  px(['WWWW', 'WxxW', 'WxxW', 'WWWW'], { W: '#f5efdc', x: '#b9b2a6' }),
  // 6 espresso cup with steam
  px(['.s..', 's...', 'WWW.', 'WWWh', 'WWW.'], { W: '#f5efdc', h: '#f5efdc', s: '#cfd8dc' }),
  // 7 homework bot
  px(['..#..', '.MMM.', 'MoMoM', '.MMM.', '.M.M.'], { '#': '#c94f4f', M: '#8f9aa5', o: '#7ae0e8' }),
  // 8 time-turner (hourglass)
  px(['CCCCC', '.GGG.', '..G..', '.G.G.', 'CCCCC'], { C: '#7ae0e8', G: '#e8b23a' }),
  // 9 galaxy brain
  px(['.PPP.', 'PPpPP', 'PpPpP', 'PPPPP', '.P.P.'], { P: '#e88ad4', p: '#c45fb8' }),
];

const deskCache = new Map<number, HTMLCanvasElement>();

/** Desk with clutter for the given tier (0 = bare, 1..9 highest generator). */
export function deskSprite(tier: number): HTMLCanvasElement {
  const key = Math.max(0, Math.min(9, tier));
  const hit = deskCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(DESK_W, DESK_H + 4);
  ctx.drawImage(baseDesk(), 0, 4);
  // Show up to the three highest unlocked clutter items.
  const items: number[] = [];
  for (let t = key; t >= 1 && items.length < 3; t--) items.push(t - 1);
  const slots = [2, 11, 19];
  items.reverse().forEach((itemIx, i) => {
    const item = CLUTTER[itemIx]!;
    ctx.drawImage(item, slots[i]! + (i === 2 ? -1 : 0), 4 + 6 - item.height);
  });
  deskCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Furniture

export function boardSprite(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = PAL.frame;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PAL.board;
  ctx.fillRect(2, 2, w - 4, h - 6);
  ctx.fillStyle = PAL.boardDark;
  ctx.fillRect(2, 2, w - 4, 1);
  // chalk tray
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(4, h - 3, w - 8, 2);
  ctx.fillStyle = PAL.chalk;
  ctx.fillRect(8, h - 4, 4, 1);
  return c;
}

export function windowSprite(): HTMLCanvasElement {
  const [c, ctx] = canvas(20, 16);
  ctx.fillStyle = PAL.frame;
  ctx.fillRect(0, 0, 20, 16);
  ctx.fillStyle = PAL.sky;
  ctx.fillRect(2, 2, 16, 12);
  ctx.fillStyle = PAL.cloud;
  ctx.fillRect(4, 5, 5, 2);
  ctx.fillRect(6, 4, 3, 1);
  ctx.fillRect(11, 9, 4, 2);
  ctx.fillStyle = PAL.frame;
  ctx.fillRect(9, 2, 2, 12);
  ctx.fillRect(2, 7, 16, 1);
  return c;
}

export function doorSprite(): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 26);
  ctx.fillStyle = PAL.frame;
  ctx.fillRect(0, 0, 16, 26);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(2, 2, 12, 24);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(4, 4, 8, 6);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(11, 14, 2, 2);
  return c;
}

export function teacherDeskSprite(): HTMLCanvasElement {
  const [c, ctx] = canvas(34, 14);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(1, 0, 32, 1);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 1, 34, 7);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 8, 34, 2);
  ctx.fillRect(2, 10, 3, 4);
  ctx.fillRect(29, 10, 3, 4);
  // apple for the teacher
  ctx.fillStyle = PAL.red;
  ctx.fillRect(26, -0 + 2, 3, 3);
  ctx.fillStyle = '#3f9e4d';
  ctx.fillRect(27, 1, 1, 1);
  // a stack of tests to grade
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(4, 2, 8, 4);
  ctx.fillStyle = PAL.chalkDim;
  ctx.fillRect(5, 3, 6, 1);
  return c;
}

export function posterSprite(kind: number): HTMLCanvasElement {
  const [c, ctx] = canvas(12, 15);
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(0, 0, 12, 15);
  ctx.fillStyle = PAL.chalkDim;
  ctx.fillRect(0, 0, 12, 1);
  if (kind === 0) {
    // world map
    ctx.fillStyle = '#8fc7dd';
    ctx.fillRect(1, 2, 10, 11);
    ctx.fillStyle = '#3f9e4d';
    ctx.fillRect(2, 4, 3, 3);
    ctx.fillRect(6, 6, 4, 2);
    ctx.fillRect(4, 9, 2, 2);
  } else {
    // ABC poster
    ctx.fillStyle = PAL.red;
    ctx.fillRect(2, 3, 3, 3);
    ctx.fillStyle = '#4a6bd4';
    ctx.fillRect(7, 3, 3, 3);
    ctx.fillStyle = '#3f9e4d';
    ctx.fillRect(2, 8, 3, 3);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(7, 8, 3, 3);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Icons + FX sprites

export const planeSprite = px(
  ['#.....', '####..', '#WWW##', '####..', '#.....'],
  { '#': '#c9d2da', W: '#f5f8fa' },
);

export const starIcon = px(
  ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '#.....#'],
  { '#': PAL.gold },
);

export const brainIcon = px(
  ['.PPPP.', 'PPpPPP', 'PpPPpP', 'PPpPPP', '.PPPP.', '..PP..'],
  { P: '#e88ad4', p: '#c45fb8' },
);

export const trophyIcon = px(
  ['#####', '#GGG#', '.GGG.', '..G..', '.GGG.'],
  { '#': PAL.gold, G: PAL.gold },
);

export const gearIcon = px(
  ['.#.#.#.', '.#####.', '###.###', '.##.##.', '###.###', '.#####.', '.#.#.#.'],
  { '#': '#7d8a97' },
);

export const zzzIcon = px(['###', '..#', '.#.', '#..', '###'], { '#': '#8ca3c7' });

const EMOTE_MAPS: Array<{ rows: string[]; pal: Record<string, string> }> = [
  // 0 thumbs up
  { rows: ['...##', '..##.', '####.', '####.', '####.', '.###.'], pal: { '#': '#e8c39e' } },
  // 1 laugh
  {
    rows: ['.YYYY.', 'YoYYoY', 'YYYYYY', 'YMMMMY', '.YMMY.', '..YY..'],
    pal: { Y: '#f0d858', o: '#26221c', M: '#26221c' },
  },
  // 2 angry
  {
    rows: ['.RRRR.', 'RoRRoR', 'RRRRRR', 'R.MM.R', '.RRRR.', '..RR..'],
    pal: { R: '#e06a5a', o: '#26221c', M: '#26221c' },
  },
  // 3 cry
  {
    rows: ['.YYYY.', 'YoYYoY', 'YbYYbY', 'YYMMYY', '.YYYY.', '..YY..'],
    pal: { Y: '#f0d858', o: '#26221c', b: '#4aa5e8', M: '#26221c' },
  },
  // 4 heart
  { rows: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], pal: { '#': '#e05a7a' } },
  // 5 fire
  {
    rows: ['...#..', '..##..', '.####.', '######', '#YY##.', '.YY#..'],
    pal: { '#': '#e07b3a', Y: '#f0d858' },
  },
  // 6 question
  { rows: ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'], pal: { '#': '#4a6bd4' } },
  // 7 nerd (glasses)
  {
    rows: ['######', '#oo#oo', '######', '.#..#.', '......', '......'],
    pal: { '#': '#26221c', o: '#f5efdc' },
  },
];

export const emoteSprites: HTMLCanvasElement[] = EMOTE_MAPS.map((m) => px(m.rows, m.pal));

// ---------------------------------------------------------------------------
// DOM helpers

/** Scaled data-URL for using pixel sprites as <img> in the DOM UI. */
export function iconDataUrl(sprite: HTMLCanvasElement, scale = 3): string {
  const [c, ctx] = canvas(sprite.width * scale, sprite.height * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** The clutter item representing a generator (for the shop list). */
export function genIcon(genIndex: number): HTMLCanvasElement {
  return CLUTTER[Math.max(0, Math.min(CLUTTER.length - 1, genIndex))]!;
}
