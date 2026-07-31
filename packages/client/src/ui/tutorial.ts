/**
 * Onboarding: a short skippable tutorial plus standalone interaction hints.
 *
 * The hints are deliberately independent of the tutorial — a player who skips
 * the tutorial still gets an arrow on "Take notes!", then on the first
 * affordable generator, then on Upgrades once one is affordable.
 */

import { getPrefs, hasHint, markHint, setPrefs } from '../prefs';
import { t } from '../i18n';
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

const STEPS: readonly Step[] = [
  { key: 'welcome', tab: 'classroom' },
  { key: 'click', target: () => id('btn-click') },
  { key: 'shop', target: () => id('gen-list'), tab: 'shop' },
  { key: 'goal', target: () => id('canvas-wrap'), tab: 'classroom' },
  { key: 'steal', target: () => id('canvas-wrap'), tab: 'classroom' },
  { key: 'boss' },
];

const hintRoot = () => id('hint-root');

/** Distance from the viewport bottom that keeps overlays clear of the banner. */
function bottomInset(): number {
  let inset = 12;
  for (const elementId of ['banner-dock', 'site-footer', 'mobile-tabs']) {
    const node = document.getElementById(elementId);
    if (node && !node.classList.contains('hidden')) inset += node.offsetHeight;
  }
  return inset;
}

// ------------------------------------------------------------------ Tutorial

let tutorialActive = false;

export function startTutorial(opts?: { force?: boolean }): void {
  if (tutorialActive) return;
  if (!opts?.force && getPrefs().tutorialDone) return;
  tutorialActive = true;
  const release = pushOverlay();

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

  const place = () => {
    card.style.bottom = `${bottomInset()}px`;
  };

  const paint = () => {
    const s = STEPS[index]!;
    if (s.tab) setMobileTab(s.tab);
    step.textContent = t('tutorial.step', { n: index + 1, total: STEPS.length });
    title.textContent = t(`tutorial.${s.key}.h`);
    bodyText.textContent = t(`tutorial.${s.key}.p`);
    next.textContent = index === STEPS.length - 1 ? t('tutorial.done') : t('tutorial.next');
    highlighted?.classList.remove('tut-target');
    highlighted = s.target?.() ?? null;
    highlighted?.classList.add('tut-target');
    place();
  };

  const finish = () => {
    if (!tutorialActive) return;
    tutorialActive = false;
    highlighted?.classList.remove('tut-target');
    card.remove();
    window.removeEventListener('resize', place);
    release();
    setPrefs({ tutorialDone: true });
    // Interaction hints take over from here.
    refreshHints();
  };

  skip.onclick = finish;
  next.onclick = () => {
    if (index >= STEPS.length - 1) {
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
