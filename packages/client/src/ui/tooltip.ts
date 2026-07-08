import { el } from './dom';

export interface TipStat {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}

/** Rich hover card shown at the cursor. */
export interface TipCard {
  title: string;
  body?: string;
  stats?: TipStat[];
  footer?: string;
  warnFooter?: boolean;
}

let tip: HTMLDivElement | null = null;
let onMove: ((ev: MouseEvent) => void) | null = null;

function ensureTip(): HTMLDivElement {
  if (!tip) {
    tip = el('div', 'kr-tip hidden');
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  return tip;
}

function positionAt(box: HTMLDivElement, x: number, y: number): void {
  const margin = 10;
  const offset = 16;
  let left = x + offset;
  let top = y + offset;

  // Flip to the left / above when we'd clip the viewport edge.
  if (left + box.offsetWidth > window.innerWidth - margin) {
    left = x - box.offsetWidth - offset;
  }
  if (top + box.offsetHeight > window.innerHeight - margin) {
    top = y - box.offsetHeight - offset;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - box.offsetWidth - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - box.offsetHeight - margin));

  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

function render(card: TipCard): void {
  const box = ensureTip();
  box.innerHTML = '';

  box.appendChild(el('div', 'kr-tip-title', card.title));
  if (card.body) box.appendChild(el('div', 'kr-tip-body', card.body));

  if (card.stats?.length) {
    const stats = el('div', 'kr-tip-stats');
    for (const s of card.stats) {
      const row = el('div', 'kr-tip-stat');
      row.appendChild(el('span', 'lbl', s.label));
      const val = el('span', 'val', s.value);
      if (s.accent) val.classList.add('accent');
      if (s.warn) val.classList.add('warn');
      row.appendChild(val);
      stats.appendChild(row);
    }
    box.appendChild(stats);
  }

  if (card.footer) {
    const foot = el('div', `kr-tip-footer${card.warnFooter ? ' warn' : ''}`, card.footer);
    box.appendChild(foot);
  }
}

function hide(): void {
  tip?.classList.add('hidden');
  if (onMove) {
    document.removeEventListener('mousemove', onMove);
    onMove = null;
  }
}

/**
 * Show a cursor-following info card on hover. Uses a wrapper pattern so it
 * still works when the anchor is styled as unaffordable (never `disabled`).
 */
export function bindCursorTip(anchor: HTMLElement, build: () => TipCard | null): void {
  anchor.addEventListener('mouseenter', (ev) => {
    const card = build();
    if (!card) return;
    const box = ensureTip();
    render(card);
    box.classList.remove('hidden');
    positionAt(box, ev.clientX, ev.clientY);
    onMove = (e) => positionAt(box, e.clientX, e.clientY);
    document.addEventListener('mousemove', onMove);
  });
  anchor.addEventListener('mouseleave', hide);
}

export function hideCursorTip(): void {
  hide();
}
