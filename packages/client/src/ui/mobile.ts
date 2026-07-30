/**
 * Phone layout: the classroom and the School Kiosk each get the full screen,
 * switched with a tab bar, so neither is squeezed into a sliver.
 *
 * The "Take notes!" button and the rewarded-ad slot stay docked above the tab
 * bar in both tabs, so the core loop works without switching back and forth.
 * The same layout is used in portrait and landscape.
 */

import { id } from './dom';

export type MobileTab = 'classroom' | 'shop';

/** Narrow *or* short: landscape phones are wide but only ~400 px tall. */
const MOBILE_QUERY = '(max-width: 900px), (max-height: 560px)';

let current: MobileTab = 'classroom';
let isMobile = false;
const listeners = new Set<(tab: MobileTab) => void>();

export function isMobileLayout(): boolean {
  return isMobile;
}

export function currentTab(): MobileTab {
  return current;
}

export function onTabChange(fn: (tab: MobileTab) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMobileTab(tab: MobileTab): void {
  current = tab;
  if (!isMobile) return;
  document.body.classList.toggle('m-tab-classroom', tab === 'classroom');
  document.body.classList.toggle('m-tab-shop', tab === 'shop');
  id('tab-classroom').classList.toggle('on', tab === 'classroom');
  id('tab-shop').classList.toggle('on', tab === 'shop');
  for (const fn of listeners) fn(tab);
}

export function initMobileTabs(): void {
  const mq = window.matchMedia(MOBILE_QUERY);
  const tabs = id('mobile-tabs');

  const apply = () => {
    isMobile = mq.matches;
    document.body.classList.toggle('mobile', isMobile);
    tabs.classList.toggle('hidden', !isMobile);
    if (isMobile) {
      setMobileTab(current);
    } else {
      document.body.classList.remove('m-tab-classroom', 'm-tab-shop');
    }
  };

  id('tab-classroom').addEventListener('click', () => setMobileTab('classroom'));
  id('tab-shop').addEventListener('click', () => setMobileTab('shop'));
  mq.addEventListener('change', apply);
  apply();
}
