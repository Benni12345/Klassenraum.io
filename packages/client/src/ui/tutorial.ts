/**
 * Onboarding: a short skippable tutorial plus standalone interaction hints.
 *
 * The hints are deliberately independent of the tutorial — a player who skips
 * the tutorial still gets an arrow on "Take notes!", then on the first
 * affordable generator, then on Upgrades once one is affordable.
 */

import { CG_TUTORIAL_KEY, flushPrefs, getPrefs, hasHint, markHint, setPrefs } from '../prefs';
import { t } from '../i18n';
import { platform } from '../platform';
import { store } from '../state';
import { el, id } from './dom';
import { currentTab, isLandscapeMobile, isMobileLayout, onTabChange, setMobileTab, type MobileTab } from './mobile';
import { pushOverlay } from './overlay';

interface Step {
  key: string;
  target?: () => HTMLElement | null;
  /** Phone layout: which tab must be visible for the target to exist. */
  tab?: MobileTab;
}

/**
 * Prefer CrazyGames SystemInfo, but when the UI is already in the phone tab
 * layout treat it as touch — Chromebooks / narrow desktops report "desktop"
 * yet still use CLASSROOM / KIOSK tabs.
 */
function isTouchTutorial(): boolean {
  if (isMobileLayout()) return true;
  const device = platform.deviceType;
  return device === 'mobile' || device === 'tablet';
}

/** Desktop gets the Tab/boss step; mobile/tablet stop after steal. */
function buildSteps(): Step[] {
  const touch = isTouchTutorial();
  const steps: Step[] = [
    { key: 'welcome', tab: 'classroom' },
    {
      key: touch ? 'clickTouch' : 'click',
      target: () => id('btn-click'),
    },
    {
      key: 'shop',
      // Spotlight the Stubby Pencil row so the purchase action is obvious.
      target: () => document.querySelector<HTMLElement>('#gen-list .gen') ?? id('gen-list'),
      tab: 'shop',
    },
    { key: 'goal', target: () => id('canvas-wrap'), tab: 'classroom' },
    { key: 'steal', target: () => id('canvas-wrap'), tab: 'classroom' },
  ];
  if (!touch) steps.push({ key: 'boss' });
  return steps;
}

const hintRoot = () => id('hint-root');

function isDisplayed(node: HTMLElement | null): node is HTMLElement {
  if (!node || node.classList.contains('hidden')) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** Hard chrome under the play area (never covered). */
function bottomChrome(): number {
  let inset = 10;
  for (const elementId of ['banner-dock', 'site-footer', 'mobile-tabs']) {
    const node = document.getElementById(elementId);
    if (!isDisplayed(node)) continue;
    inset += node.getBoundingClientRect().height;
  }
  return inset;
}

function hudBottom(): number {
  const hud = document.getElementById('hud');
  return hud ? Math.max(8, hud.getBoundingClientRect().bottom + 8) : 8;
}

// ------------------------------------------------------------------ Tutorial

let tutorialActive = false;
const endListeners = new Set<() => void>();

/** Fires once when the active tutorial finishes or is skipped. */
export function onTutorialEnd(fn: () => void): () => void {
  endListeners.add(fn);
  return () => endListeners.delete(fn);
}

export function startTutorial(opts?: { force?: boolean }): void {
  if (tutorialActive) return;
  if (!opts?.force && getPrefs().tutorialDone) return;
  tutorialActive = true;
  document.body.classList.add('tutoring');
  const release = pushOverlay();
  // Guided tours should not count as active gameplay for CrazyGames.
  platform.onGameplayStop();

  const steps = buildSteps();
  let index = 0;
  const card = el('div', 'tut-card');
  const step = el('div', 'tut-step');
  const title = el('h3', 'tut-title');
  const bodyText = el('p', 'tut-body');
  const actions = el('div', 'tut-actions');
  const skip = el('button', 'btn small tut-skip', t('tutorial.skip'));
  skip.type = 'button';
  const next = el('button', 'btn gold small tut-next');
  next.type = 'button';
  actions.appendChild(skip);
  actions.appendChild(next);
  card.appendChild(step);
  card.appendChild(title);
  card.appendChild(bodyText);
  card.appendChild(actions);
  hintRoot().appendChild(card);

  let highlighted: HTMLElement | null = null;

  /** True when the target is a large region (classroom), not a single control. */
  const isRegionTarget = (node: HTMLElement | null): boolean => {
    if (!node) return false;
    return node.id === 'canvas-wrap' || node.id === 'gen-list';
  };

  /**
   * Keep the card on-screen between the HUD and bottom chrome, and clear of
   * the highlighted control (and Take notes when it is not the target).
   */
  const place = () => {
    const margin = 8;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const topMin = hudBottom();
    const bottomMax = vh - bottomChrome();

    card.style.left = '50%';
    card.style.transform = 'translateX(-50%)';
    card.style.width = `${Math.min(420, vw - 16)}px`;
    card.style.maxHeight = 'none';
    const natural = Math.max(card.scrollHeight, 1);

    // Soft obstacles: highlighted control, and Take notes when it isn't the focus.
    const obstacles: DOMRect[] = [];
    if (highlighted && !isRegionTarget(highlighted)) {
      const rect = highlighted.getBoundingClientRect();
      if (rect.height > 0) obstacles.push(rect);
    } else {
      const click = document.getElementById('btn-click');
      if (isDisplayed(click)) {
        const rect = click.getBoundingClientRect();
        // Only treat as obstacle when it sits in the play column (mobile).
        if (rect.height > 0 && rect.top < bottomMax && rect.width > vw * 0.4) {
          obstacles.push(rect);
        }
      }
    }

    // Largest gap in [topMin, bottomMax] that does not cover obstacles.
    type Gap = { start: number; end: number };
    const gaps: Gap[] = [{ start: topMin, end: bottomMax }];
    for (const rect of obstacles) {
      const next: Gap[] = [];
      for (const gap of gaps) {
        const obsTop = rect.top - margin;
        const obsBottom = rect.bottom + margin;
        if (obsBottom <= gap.start || obsTop >= gap.end) {
          next.push(gap);
          continue;
        }
        if (obsTop > gap.start) next.push({ start: gap.start, end: obsTop });
        if (obsBottom < gap.end) next.push({ start: obsBottom, end: gap.end });
      }
      gaps.length = 0;
      gaps.push(...next);
    }

    let best = gaps[0] ?? { start: topMin, end: bottomMax };
    for (const gap of gaps) {
      if (gap.end - gap.start > best.end - best.start) best = gap;
    }

    const gapH = Math.max(96, best.end - best.start);
    const cardH = Math.min(natural, gapH);
    card.style.maxHeight = `${cardH}px`;

    // Prefer above a bottom control; otherwise top-align in the best gap.
    let anchorTop = best.start;
    if (highlighted && !isRegionTarget(highlighted)) {
      const rect = highlighted.getBoundingClientRect();
      const above = rect.top - margin - cardH;
      if (above >= best.start && above + cardH <= best.end) {
        anchorTop = above;
      } else {
        // Fall back to the top of the gap (still on-screen).
        anchorTop = best.start;
      }
    }

    // Final clamp — never leave the viewport.
    const maxTop = Math.max(topMin, bottomMax - cardH);
    anchorTop = Math.min(Math.max(anchorTop, topMin), maxTop);
    card.style.top = `${anchorTop}px`;
    card.style.bottom = 'auto';
  };

  const paint = () => {
    const s = steps[index]!;
    if (s.tab) setMobileTab(s.tab);
    step.textContent = t('tutorial.step', { n: index + 1, total: steps.length });
    title.textContent = t(`tutorial.${s.key}.h`);
    bodyText.textContent = t(`tutorial.${s.key}.p`);
    next.textContent = index === steps.length - 1 ? t('tutorial.done') : t('tutorial.next');
    highlighted?.classList.remove('tut-target');
    highlighted = s.target?.() ?? null;
    highlighted?.classList.add('tut-target');
    // Bring small controls into view; skip huge regions (they fill the pane).
    if (highlighted && !isRegionTarget(highlighted)) {
      highlighted.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
  };

  const finish = () => {
    if (!tutorialActive) return;
    tutorialActive = false;
    document.body.classList.remove('tutoring');
    highlighted?.classList.remove('tut-target');
    card.remove();
    window.removeEventListener('resize', place);
    release();
    setPrefs({ tutorialDone: true });
    flushPrefs();
    // Persist across browsers for the same CrazyGames account.
    if (platform.enabled) platform.setDataItem(CG_TUTORIAL_KEY, '1');
    // Resume gameplay only after the guided tour ends (or is skipped).
    if (store.you && store.status === 'open') platform.onGameplayStart();
    for (const fn of endListeners) fn();
    // Interaction hints take over from here.
    refreshHints();
  };

  skip.onclick = finish;
  next.onclick = () => {
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    index += 1;
    paint();
  };

  window.addEventListener('resize', place);
  paint();
}

export function isTutorialActive(): boolean {
  return tutorialActive;
}

// --------------------------------------------------------------------- Hints

interface Hint {
  id: string;
  label: () => string;
  target: () => HTMLElement | null;
  /** Show while true; the hint is retired once `done` turns true. */
  ready: () => boolean;
  done: () => boolean;
}

const HINTS: readonly Hint[] = [
  {
    id: 'click',
    label: () => t('hint.click'),
    target: () => id('btn-click'),
    ready: () => store.you !== null,
    done: () => (store.you?.clicks ?? 0) > 0,
  },
  {
    id: 'kiosk',
    label: () => t('hint.kiosk'),
    target: () => {
      // On phones the kiosk sits behind a tab — point at that tab so players
      // learn where upgrades live. On desktop the shop is already visible.
      if (isMobileLayout() && currentTab() !== 'shop') return id('tab-shop');
      return id('shop-title');
    },
    ready: () => {
      const you = store.you;
      if (!you || you.bp < 15) return false;
      if (you.gens.some((n) => n > 0)) return false;
      // Landscape already shows the kiosk beside the classroom.
      if (isLandscapeMobile()) return false;
      // Only nudge when the kiosk isn't on screen (phone portrait tabs).
      return isMobileLayout() && currentTab() !== 'shop';
    },
    done: () => {
      const you = store.you;
      if (you?.gens.some((n) => n > 0)) return true;
      if (!isMobileLayout() || isLandscapeMobile()) return true;
      return currentTab() === 'shop';
    },
  },
  {
    id: 'gen',
    label: () => t('hint.gen'),
    target: () => document.querySelector<HTMLElement>('#gen-list .gen.afford'),
    ready: () => document.querySelector('#gen-list .gen.afford') !== null,
    done: () => (store.you?.gens.some((n) => n > 0) ?? false),
  },
  {
    id: 'upgrade',
    label: () => t('hint.upgrade'),
    target: () => document.querySelector<HTMLElement>('#upgrade-row .upgrade-btn:not(.cant)'),
    ready: () => document.querySelector('#upgrade-row .upgrade-btn:not(.cant)') !== null,
    done: () => (store.you?.upgrades.length ?? 0) > 0,
  },
  {
    id: 'prestige',
    label: () => t('hint.prestige'),
    target: () => {
      const btn = id('btn-prestige');
      return btn.classList.contains('hidden') ? null : btn;
    },
    ready: () => (store.you?.starsIfGraduate ?? 0) >= 1,
    done: () => (store.you?.grade ?? 0) > 0,
  },
];

let arrow: HTMLElement | null = null;
let arrowLabel: HTMLElement | null = null;
let currentHint: Hint | null = null;

function ensureArrow(): HTMLElement {
  if (!arrow) {
    arrow = el('div', 'hint-arrow');
    arrowLabel = el('span', 'hint-label');
    arrow.appendChild(arrowLabel);
    arrow.appendChild(el('span', 'hint-tip', '▼'));
    hintRoot().appendChild(arrow);
  }
  return arrow;
}

function hideArrow(): void {
  currentHint = null;
  arrow?.classList.add('hidden');
}

function positionArrow(target: HTMLElement): void {
  const node = ensureArrow();
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    node.classList.add('hidden');
    return;
  }
  node.classList.remove('hidden');
  // Prefer sitting above the target; flip below when there is no room.
  const height = node.offsetHeight || 46;
  const above = rect.top - height - 6;
  const below = rect.bottom + 6;
  const flip = above < 8;
  node.classList.toggle('below', flip);
  node.style.top = `${Math.max(8, flip ? below : above)}px`;
  const left = rect.left + rect.width / 2 - (node.offsetWidth || 140) / 2;
  node.style.left = `${Math.min(Math.max(8, left), window.innerWidth - (node.offsetWidth || 140) - 8)}px`;
}

/** Picks the first hint that is ready and not yet completed. */
function refreshHints(): void {
  if (tutorialActive || !store.you) {
    hideArrow();
    return;
  }
  for (const hint of HINTS) {
    if (hasHint(hint.id)) continue;
    if (hint.done()) {
      markHint(hint.id);
      continue;
    }
    if (!hint.ready()) continue;
    const target = hint.target();
    if (!target) continue;
    if (currentHint?.id !== hint.id) {
      currentHint = hint;
      if (arrowLabel === null) ensureArrow();
      arrowLabel!.textContent = hint.label();
    }
    positionArrow(target);
    return;
  }
  hideArrow();
}

export function initHints(): void {
  window.setInterval(refreshHints, 400);
  window.addEventListener('resize', refreshHints);
  store.on('you', refreshHints);
  store.on('joined', refreshHints);
  onTabChange(refreshHints);
}
