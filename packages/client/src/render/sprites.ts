import { DEFAULT_DESK_SKIN, DESK_PALETTES } from '@shared/school';
import type { AvatarSpec } from '@shared/types';

/**
 * All pixel art is authored in code: string maps -> offscreen canvases.
 * '.' = transparent, letters = palette entries. Everything renders at
 * logical-pixel resolution and is scaled up with imageSmoothing disabled.
 *
 * Silhouettes get a 1px ink outline so furniture and characters read like
 * 16-bit classroom sprites (Habbo / Stardew-style).
 */

export const SKINS = ['#f6d7b0', '#e0b088', '#c1885f', '#8d5a3b'] as const;
export const HAIR_COLORS = ['#2a1a12', '#6b3e1e', '#f0d056', '#e04528', '#3d6ee8', '#e85cb0'] as const;
export const SHIRTS = ['#e44545', '#3d6ee8', '#3cb85a', '#f0c23a', '#9b4ae8', '#f07828', '#2eb8b8', '#6a7a8a'] as const;

export const PAL = {
  wood: '#c4894a',
  woodDark: '#8a5a28',
  woodLight: '#d4a86a',
  floor: '#c4894a',
  floorLine: '#a06e34',
  floorDark: '#8a5a28',
  wall: '#b6ead4',
  wallDark: '#8fc9b0',
  wallDeep: '#7bb89e',
  board: '#2d6b4c',
  boardDark: '#1e4d38',
  frame: '#8a5a28',
  chalk: '#eef3ea',
  chalkDim: '#b7cbb9',
  sky: '#5ec8f5',
  skyDeep: '#3aa8e0',
  cloud: '#ffffff',
  ink: '#1a1410',
  paper: '#f7edd4',
  gold: '#f0c23a',
  red: '#e44545',
  green: '#3cb85a',
  blue: '#3d6ee8',
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

const OUTLINE_DIRS: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** 4-neighbour ink silhouette. Expands the canvas by 1px on each side. */
export function outlined(src: HTMLCanvasElement, color = PAL.ink): HTMLCanvasElement {
  const [c, ctx] = canvas(src.width + 2, src.height + 2);
  const [mask, mctx] = canvas(src.width, src.height);
  mctx.drawImage(src, 0, 0);
  mctx.globalCompositeOperation = 'source-in';
  mctx.fillStyle = color;
  mctx.fillRect(0, 0, src.width, src.height);
  for (const [dx, dy] of OUTLINE_DIRS) ctx.drawImage(mask, 1 + dx, 1 + dy);
  ctx.drawImage(src, 1, 1);
  return c;
}

function lazy(make: () => HTMLCanvasElement): () => HTMLCanvasElement {
  let s: HTMLCanvasElement | null = null;
  return () => (s ??= make());
}

// ---------------------------------------------------------------------------
// Student (seen from behind, facing the board)

const HEAD = [
  '....######....',
  '...########...',
  '..##########..',
  '..##########..',
  '..##########..',
  '...########...',
  '....######....',
  '......##......',
];

const HAIR_TOP: string[][] = [
  // 0: short
  ['....######....', '...########...', '..##########..', '..##......##..'],
  // 1: bob
  ['....######....', '...########...', '..##########..', '..###....###..'],
  // 2: long
  ['....######....', '...########...', '..##########..', '..###....###..'],
  // 3: curly
  ['...########...', '..##########..', '.############.', '..###....###..'],
  // 4: cap (hair peeking under a dark brim; brim drawn in code)
  ['....######....', '...########...', '..##########..'],
];

const HAIR_DRAPE: string[][] = [
  [],
  // bob — hangs to the jaw
  ['', '', '', '', '', '..##......##..', '..##......##..'],
  // long — over the shoulders
  [
    '',
    '',
    '',
    '',
    '',
    '..##......##..',
    '..##......##..',
    '..##......##..',
    '.##........##.',
    '.##........##.',
    '.##........##.',
  ],
  // curly sides
  ['', '', '', '', '.##........##.', '.##........##.'],
  [],
];

const BODY = [
  '...########...',
  '..##########..',
  '.############.',
  '.############.',
  '.############.',
  '..##########..',
];

const studentCache = new Map<string, HTMLCanvasElement>();

/** Seated student seen from behind, with a 1px ink outline. */
export function studentSprite(a: AvatarSpec): HTMLCanvasElement {
  const key = `${a.skin}-${a.hair}-${a.hairColor}-${a.shirt}`;
  const hit = studentCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(14, 18);
  const skin = SKINS[a.skin] ?? SKINS[0];
  const hairC = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const shirt = SHIRTS[a.shirt] ?? SHIRTS[0];
  ctx.drawImage(px(HEAD, { '#': skin }), 0, 1);
  ctx.drawImage(px(HAIR_TOP[a.hair] ?? HAIR_TOP[0]!, { '#': hairC }), 0, 0);
  const body = px(BODY, { '#': shirt });
  ctx.drawImage(body, 0, 9);
  const drape = HAIR_DRAPE[a.hair];
  if (drape && drape.length) ctx.drawImage(px(drape, { '#': hairC }), 0, 0);
  if (a.hair === 4) {
    ctx.fillStyle = '#3d4a5c';
    ctx.fillRect(2, 1, 10, 3);
    ctx.fillStyle = '#2a3340';
    ctx.fillRect(2, 3, 10, 1);
    ctx.fillRect(9, 4, 3, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(1, 16, 12, 1);
  const out = outlined(c);
  studentCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Teacher (front view, facing the class), walk frames + idle-with-pointer

const TEACHER_PAL = {
  H: '#6b3e1e',
  h: '#4a2a14',
  '#': '#e8c39e',
  o: PAL.ink,
  B: '#3d6ee8',
  b: '#2a52b8',
  L: '#7a7e88',
  l: '#5a5e68',
  S: PAL.ink,
  P: '#e8d4a8',
  p: '#c9a06b',
};

function teacherMap(frame: number, pointer: boolean): string[] {
  const arms = pointer
    ? ['..#..BBBBBB..#P.', '..#..BBBBBB..#pP']
    : ['..#..BBBBBB..#..', '..#..BBBBBB..#..'];
  const hip = pointer ? '.....LLLLLL...p.' : '.....LLLLLL.....';
  const stride = frame === 0;
  const legs = pointer
    ? ['....LL....LL..p.', '....LL....LL....', '....SS....SS....']
    : stride
      ? ['....LL....LL....', '....LL....LL....', '....SS....SS....']
      : ['.....LL..LL.....', '....LL....LL....', '...SS......SS...'];
  return [
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....Hh####hH....',
    '....H#o##o#H....',
    '....HH####HH....',
    '.....######.....',
    '....bBBBBBBb....',
    '...BBBBBBBBBB...',
    ...arms,
    hip,
    ...legs,
  ];
}

const TEACHER_WALK = [0, 1].map((f) => outlined(px(teacherMap(f, false), TEACHER_PAL)));
const TEACHER_IDLE = outlined(px(teacherMap(0, true), TEACHER_PAL));

export function teacherSprite(frame: number, withPointer = false): HTMLCanvasElement {
  if (withPointer) return TEACHER_IDLE;
  return TEACHER_WALK[frame % 2]!;
}

// ---------------------------------------------------------------------------
// Desk + clutter tiers

export const DESK_W = 26;
export const DESK_H = 12;

function baseDesk(skin = DEFAULT_DESK_SKIN): HTMLCanvasElement {
  const pal = DESK_PALETTES[skin] ?? DESK_PALETTES[DEFAULT_DESK_SKIN]!;
  const [c, ctx] = canvas(DESK_W, DESK_H);
  ctx.fillStyle = pal.light;
  ctx.fillRect(1, 0, DESK_W - 2, 2);
  ctx.fillStyle = pal.mid;
  ctx.fillRect(0, 2, DESK_W, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 5; i++) ctx.fillRect(3 + i * 5, 3 + (i % 3), 3, 1);
  ctx.fillStyle = pal.dark;
  ctx.fillRect(0, 7, DESK_W, 2);
  ctx.fillRect(2, 9, 3, 3);
  ctx.fillRect(DESK_W - 5, 9, 3, 3);
  return outlined(c);
}

const CLUTTER: HTMLCanvasElement[] = [
  outlined(px(['..#', '.YG', 'YGR', 'YY.'], { Y: '#f0c23a', G: '#4a4a4a', R: '#e88a9a', '#': '#4a4a4a' })),
  outlined(px(['YY.y', 'YYyy', '.yy.'], { Y: '#f0d858', y: '#e8ef7a' })),
  outlined(px(['BBBBB', 'BsssB', 'BkBkB', 'BBBBB'], { B: '#3a4148', s: '#9fd4a8', k: '#c9d2da' })),
  outlined(px(['.WWWWW.', 'WRRRRRW', 'WBBBBBW', 'WGGGGGW'], { W: PAL.paper, R: PAL.red, B: PAL.blue, G: PAL.green })),
  outlined(px(['WWWW', 'WxxW', 'Wx.W', 'WWWW'], { W: PAL.paper, x: '#b9b2a6' })),
  outlined(px(['.s..', 's...', 'WWW.', 'WWWh', 'WWW.'], { W: PAL.paper, h: PAL.wood, s: '#cfd8dc' })),
  outlined(px(['..#..', '.MMM.', 'MoMoM', '.MMM.', '.M.M.'], { '#': PAL.red, M: PAL.metal, o: '#7ae0e8' })),
  outlined(px(['CCCCC', '.G.G.', '..G..', '.G.G.', 'CCCCC'], { C: '#7ae0e8', G: PAL.gold })),
  outlined(px(['.PPP.', 'PPpPP', 'PpPpP', 'PPPPP', '.P.P.'], { P: '#e88ad4', p: '#c45fb8' })),
];

const LAPTOP = outlined(
  px(['bbbbbbb', 'bSSSSSb', 'bbbbbbb', 'kwwwwwk', 'kkkkkkk'], {
    b: '#3a4148',
    S: '#7ec8f0',
    k: '#2a3038',
    w: '#d0d6dc',
  }),
);

const deskCache = new Map<string, HTMLCanvasElement>();

/** Desk with clutter for the given tier (0 = bare, 1..9 highest generator). */
export function deskSprite(tier: number, skin = DEFAULT_DESK_SKIN): HTMLCanvasElement {
  const key = `${Math.max(0, Math.min(9, tier))}:${skin}`;
  const hit = deskCache.get(key);
  if (hit) return hit;
  const desk = baseDesk(skin);
  const [c, ctx] = canvas(desk.width, desk.height + 3);
  ctx.drawImage(desk, 0, 3);
  const clamped = Math.max(0, Math.min(9, tier));
  if (clamped >= 1) ctx.drawImage(LAPTOP, 8, 3 + 6 - LAPTOP.height);
  const items: number[] = [];
  for (let t = clamped; t >= 1 && items.length < 2; t--) {
    if (t === 3) continue;
    items.push(t - 1);
  }
  const slots = [2, 18];
  items.reverse().forEach((itemIx, i) => {
    const item = CLUTTER[itemIx]!;
    ctx.drawImage(item, slots[i]! , 3 + 7 - item.height);
  });
  deskCache.set(key, c);
  return c;
}

export const chairSprite = lazy(() => {
  const [c, ctx] = canvas(12, 10);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(1, 0, 10, 6);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(2, 1, 8, 4);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(1, 6, 10, 2);
  ctx.fillRect(2, 8, 2, 2);
  ctx.fillRect(8, 8, 2, 2);
  return outlined(c);
});

// ---------------------------------------------------------------------------
// Furniture

const boardCache = new Map<string, HTMLCanvasElement>();

export function boardSprite(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  const hit = boardCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(2, 2, w - 4, 1);
  ctx.fillStyle = PAL.boardDark;
  ctx.fillRect(3, 3, w - 6, h - 8);
  ctx.fillStyle = PAL.board;
  ctx.fillRect(4, 4, w - 8, h - 10);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(3, h - 4, w - 6, 3);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(4, h - 3, w - 8, 1);
  ctx.fillStyle = PAL.chalk;
  ctx.fillRect(8, h - 3, 5, 1);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(16, h - 3, 4, 1);
  const out = outlined(c);
  boardCache.set(key, out);
  return out;
}

export const windowSprite = lazy(() => {
  const [c, ctx] = canvas(22, 18);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 0, 22, 18);
  ctx.fillStyle = PAL.skyDeep;
  ctx.fillRect(2, 2, 18, 14);
  ctx.fillStyle = PAL.sky;
  ctx.fillRect(2, 2, 18, 8);
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(5, 4, 3, 3);
  ctx.fillStyle = PAL.cloud;
  ctx.fillRect(11, 6, 6, 2);
  ctx.fillRect(13, 5, 3, 1);
  ctx.fillRect(4, 11, 5, 2);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(10, 2, 2, 14);
  ctx.fillRect(2, 8, 18, 2);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(10, 2, 1, 14);
  return outlined(c);
});

export const doorSprite = lazy(() => {
  const [c, ctx] = canvas(16, 28);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 0, 16, 28);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(2, 2, 12, 26);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(4, 4, 8, 8);
  ctx.fillRect(4, 14, 8, 8);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(11, 16, 2, 2);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(4, 12, 8, 1);
  return outlined(c);
});

export const teacherDeskSprite = lazy(() => {
  const [c, ctx] = canvas(38, 16);
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(1, 2, 36, 2);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 4, 38, 6);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 10, 38, 2);
  ctx.fillRect(2, 12, 4, 4);
  ctx.fillRect(32, 12, 4, 4);
  ctx.drawImage(LAPTOP, 6, 0);
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(22, 3, 6, 4);
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(31, 2, 4, 4);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(35, 3, 1, 2);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(32, 1, 1, 1);
  return outlined(c);
});

export const bookshelfSprite = lazy(() => {
  const [c, ctx] = canvas(16, 40);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(0, 4, 16, 36);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(1, 5, 14, 34);
  const bookColors = [PAL.red, PAL.blue, PAL.green, PAL.gold, '#9b4ae8', '#f07828', '#2eb8b8', PAL.paper];
  const shelfYs = [6, 16, 26];
  for (const sy of shelfYs) {
    let x = 2;
    let i = 0;
    while (x < 14) {
      const bw = 2 + ((sy + i) % 2);
      if (x + bw > 14) break;
      ctx.fillStyle = bookColors[(sy + i) % bookColors.length]!;
      ctx.fillRect(x, sy, bw, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + bw - 1, sy, 1, 8);
      x += bw;
      i++;
    }
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(1, sy + 8, 14, 2);
  }
  ctx.fillStyle = PAL.woodLight;
  ctx.fillRect(1, 36, 14, 2);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(5, 1, 6, 4);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(6, 0, 2, 2);
  ctx.fillRect(8, 0, 3, 2);
  ctx.fillRect(4, 1, 2, 2);
  ctx.fillStyle = PAL.sky;
  ctx.fillRect(10, 28, 4, 4);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(11, 29, 2, 2);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(11, 32, 2, 2);
  return outlined(c);
});

export const plantSprite = lazy(() => {
  const [c, ctx] = canvas(8, 12);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(2, 0, 4, 3);
  ctx.fillRect(1, 2, 6, 3);
  ctx.fillRect(3, 5, 2, 2);
  ctx.fillStyle = '#2f8a44';
  ctx.fillRect(2, 3, 2, 2);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(2, 7, 4, 5);
  ctx.fillStyle = '#b83838';
  ctx.fillRect(2, 7, 4, 1);
  return outlined(c);
});

export function posterSprite(kind: number): HTMLCanvasElement {
  return kind === 0 ? mapPoster() : chartPoster();
}

const mapPoster = lazy(() => {
  const [c, ctx] = canvas(14, 16);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 0, 14, 16);
  ctx.fillStyle = '#8fc7dd';
  ctx.fillRect(2, 2, 10, 12);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(3, 4, 3, 3);
  ctx.fillRect(7, 6, 4, 3);
  ctx.fillRect(4, 10, 3, 2);
  ctx.fillStyle = '#2f8a44';
  ctx.fillRect(4, 5, 1, 1);
  ctx.fillRect(8, 7, 2, 1);
  return outlined(c);
});

const chartPoster = lazy(() => {
  const [c, ctx] = canvas(14, 14);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(0, 0, 14, 14);
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(2, 2, 10, 10);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(3, 3, 4, 4);
  ctx.fillStyle = PAL.blue;
  ctx.fillRect(7, 3, 4, 4);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(3, 7, 4, 4);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(7, 7, 4, 4);
  return outlined(c);
});

export const clockSprite = lazy(() => {
  const [c, ctx] = canvas(9, 9);
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(1, 0, 7, 9);
  ctx.fillRect(0, 1, 9, 7);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(4, 4, 1, 1);
  ctx.fillRect(4, 1, 1, 2);
  ctx.fillRect(5, 4, 2, 1);
  return outlined(c);
});

// ---------------------------------------------------------------------------
// Icons + FX sprites

export const planeSprite = outlined(
  px(['#.....', '####..', '#WWW##', '####..', '#.....'], { '#': '#c9d2da', W: '#f5f8fa' }),
);

export const spitSprite = outlined(px(['.#.', '###', '.#.'], { '#': '#e8d9b8' }));

export const inkSprite = outlined(
  px(['.#.#.', '#####', '.###.', '####.', '.#.#.'], { '#': '#1a2744' }),
);

export const folderSprite = outlined(
  px(['######..', '#WWWWW#.', '#WWWWW##', '#WWWWWW#', '########'], { '#': '#c9a24a', W: '#f3e3b0' }),
);

export const starIcon = outlined(
  px(['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '#.....#'], { '#': PAL.gold }),
);

export const brainIcon = outlined(
  px(['.PPPP.', 'PPpPPP', 'PpPPpP', 'PPpPPP', '.PPPP.', '..PP..'], { P: '#e88ad4', p: '#c45fb8' }),
);

export const calendarIcon = outlined(
  px(
    ['.#.#.#.', '#######', '#WWWWW#', '#W#W#W#', '#WWWWW#', '#W#W#W#', '#######'],
    { '#': PAL.red, W: PAL.paper },
  ),
);

export const trophyIcon = outlined(
  px(['.#####.', '#.GGG.#', '#.GGG.#', '.#GGG#.', '..#G#..', '..###..', '.#####.'], { '#': PAL.gold, G: '#ffe9a0' }),
);

export const gearIcon = outlined(
  px(['.#.#.#.', '.#####.', '###.###', '.##.##.', '###.###', '.#####.', '.#.#.#.'], { '#': '#7d8a97' }),
);

export const zzzIcon = outlined(px(['###', '..#', '.#.', '#..', '###'], { '#': '#8ca3c7' }));

/**
 * Rectangular video badge with a play symbol — CrazyGames requires this shape
 * on every rewarded-ad button so players recognise it as "watch a video".
 */
export const adPlayIcon = px(
  [
    '#############',
    '#...........#',
    '#..PP.......#',
    '#..PPPP.....#',
    '#..PPPPPP...#',
    '#..PPPPPPPP.#',
    '#..PPPPPP...#',
    '#..PPPP.....#',
    '#..PP.......#',
    '#...........#',
    '#############',
  ],
  { '#': PAL.ink, P: '#fdf6e3' },
);

const EMOTE_MAPS: Array<{ rows: string[]; pal: Record<string, string> }> = [
  { rows: ['...##', '..##.', '####.', '####.', '####.', '.###.'], pal: { '#': '#e8c39e' } },
  {
    rows: ['.YYYY.', 'YoYYoY', 'YYYYYY', 'YMMMMY', '.YMMY.', '..YY..'],
    pal: { Y: '#f0d858', o: PAL.ink, M: PAL.ink },
  },
  {
    rows: ['.RRRR.', 'RoRRoR', 'RRRRRR', 'R.MM.R', '.RRRR.', '..RR..'],
    pal: { R: '#e06a5a', o: PAL.ink, M: PAL.ink },
  },
  {
    rows: ['.YYYY.', 'YoYYoY', 'YbYYbY', 'YYMMYY', '.YYYY.', '..YY..'],
    pal: { Y: '#f0d858', o: PAL.ink, b: '#4aa5e8', M: PAL.ink },
  },
  { rows: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], pal: { '#': '#e05a7a' } },
  {
    rows: ['...#..', '..##..', '.####.', '######', '#YY##.', '.YY#..'],
    pal: { '#': '#e07b3a', Y: '#f0d858' },
  },
  { rows: ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'], pal: { '#': PAL.blue } },
  {
    rows: ['######', '#oo#oo', '######', '.#..#.', '......', '......'],
    pal: { '#': PAL.ink, o: PAL.paper },
  },
];

export const emoteSprites: HTMLCanvasElement[] = EMOTE_MAPS.map((m) => outlined(px(m.rows, m.pal)));

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
