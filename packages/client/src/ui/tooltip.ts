import { el } from './dom';

export interface TipLine {
  text: string;
  /** Bold title line. */
  title?: boolean;
  /** Muted secondary line (labels). */
  muted?: boolean;
  /** Warning styling (e.g. can't afford). */
  warn?: boolean;
  /** Accent color for values (e.g. cost when affordable). */
  accent?: boolean;
}

let tip: HTMLDivElement | null = null;

function ensureTip(): HTMLDivElement {
  if (!tip) {
    tip = el('div', 'kr-tooltip hidden');
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  return tip;
}

function position(anchor: HTMLElement, box: HTMLDivElement): void {
  const ar = anchor.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer left of the anchor (shop sits on the right).
  let left = ar.left - box.offsetWidth - margin;
  let top = ar.top + ar.height / 2 - box.offsetHeight / 2;

  if (left < margin) {
    // Not enough room on the left — try above.
    left = ar.left + ar.width / 2 - box.offsetWidth / 2;
    top = ar.top - box.offsetHeight - margin;
  }
  if (top < margin) top = margin;
  if (top + box.offsetHeight > vh - margin) top = vh - margin - box.offsetHeight;
  if (left + box.offsetWidth > vw - margin) left = vw - margin - box.offsetWidth;
  if (left < margin) left = margin;

  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

function render(lines: TipLine[]): void {
  const box = ensureTip();
  box.innerHTML = '';
  for (const line of lines) {
    const row = el('div', 'kr-tip-line');
    if (line.title) row.classList.add('title');
    if (line.muted) row.classList.add('muted');
    if (line.warn) row.classList.add('warn');
    if (line.accent) row.classList.add('accent');
    row.textContent = line.text;
    box.appendChild(row);
  }
}

function show(anchor: HTMLElement, lines: TipLine[] | null): void {
  if (!lines?.length) return;
  const box = ensureTip();
  render(lines);
  box.classList.remove('hidden');
  // Measure once visible, then position.
  position(anchor, box);
}

function hide(): void {
  tip?.classList.add('hidden');
}

/** Attach a hover/focus tooltip to `anchor`. `build` is called on each show. */
export function bindTooltip(anchor: HTMLElement, build: () => TipLine[] | null): void {
  const onShow = () => show(anchor, build());
  anchor.addEventListener('mouseenter', onShow);
  anchor.addEventListener('focus', onShow);
  anchor.addEventListener('mouseleave', hide);
  anchor.addEventListener('blur', hide);
}
