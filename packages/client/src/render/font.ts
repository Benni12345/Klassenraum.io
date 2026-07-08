/**
 * Tiny variable-width bitmap font (max 5x6 incl. descender), authored in-code
 * so pixel text stays crisp at any integer scale. Uppercase + digits +
 * German umlauts/ß + the punctuation the game needs.
 */

const G: Record<string, string[]> = {
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '###.', '#...', '####'],
  F: ['####', '#...', '###.', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '.###'],
  H: ['#..#', '#..#', '####', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..##', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  L: ['#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '###.', '#...', '#...'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#..#', '#..#', '.##.', '#..#', '#..#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['####', '...#', '.##.', '#...', '####'],
  Ä: ['#..#', '....', '.##.', '####', '#..#'],
  Ö: ['#..#', '....', '.##.', '#..#', '.##.'],
  Ü: ['#..#', '....', '#..#', '#..#', '.##.'],
  ß: ['.##.', '#..#', '#.#.', '#..#', '#.#.'],
  '0': ['.##.', '#..#', '#..#', '#..#', '.##.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###.', '...#', '.##.', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '###.'],
  '4': ['#..#', '#..#', '####', '...#', '...#'],
  '5': ['####', '#...', '###.', '...#', '###.'],
  '6': ['.##.', '#...', '###.', '#..#', '.##.'],
  '7': ['####', '...#', '..#.', '.#..', '.#..'],
  '8': ['.##.', '#..#', '.##.', '#..#', '.##.'],
  '9': ['.##.', '#..#', '.###', '...#', '.##.'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['.', '#', '.', '#', '.'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '×': ['...', '#.#', '.#.', '#.#', '...'],
  '=': ['...', '###', '...', '###', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  "'": ['#', '#', '.', '.', '.'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  _: ['....', '....', '....', '....', '####'],
  '★': ['..#..', '.###.', '#####', '.###.', '#...#'],
  '♥': ['.#.#.', '#####', '.###.', '..#..', '.....'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
};

const UNKNOWN = ['####', '#..#', '#..#', '#..#', '####'];

function glyphOf(ch: string): string[] {
  return G[ch] ?? G[ch.toUpperCase()] ?? UNKNOWN;
}

export function textWidth(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text) w += ((glyphOf(ch)[0] ?? '').length + 1) * scale;
  return Math.max(0, w - scale);
}

const cache = new Map<string, HTMLCanvasElement>();

function renderText(text: string, color: string): HTMLCanvasElement {
  const key = `${color}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = Math.max(1, textWidth(text));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = 6;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  let x = 0;
  for (const ch of text) {
    const g = glyphOf(ch);
    const gw = (g[0] ?? '').length;
    for (let r = 0; r < g.length; r++) {
      const row = g[r]!;
      for (let cix = 0; cix < row.length; cix++) {
        if (row[cix] === '#') ctx.fillRect(x + cix, r, 1, 1);
      }
    }
    x += gw + 1;
  }
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

/** Draw pixel text at world coords (canvas must have integer scale transform). */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts?: { shadow?: string; align?: 'left' | 'center' | 'right' },
): void {
  const img = renderText(text, color);
  let dx = Math.round(x);
  if (opts?.align === 'center') dx -= Math.round(img.width / 2);
  else if (opts?.align === 'right') dx -= img.width;
  const dy = Math.round(y);
  if (opts?.shadow) {
    ctx.drawImage(renderText(text, opts.shadow), dx + 1, dy + 1);
  }
  ctx.drawImage(img, dx, dy);
}
