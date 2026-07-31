/**
 * Phone / tablet layout: the classroom and the School Kiosk each get the full
 * screen, switched with a tab bar, so neither is squeezed into a sliver.
 *
 * Desktop must keep the side-by-side classroom + kiosk layout even when the
 * game is not fullscreen (short window heights used to flip into this mode via
 * a max-height media query). Prefer CrazyGames SystemInfo when available;
 * otherwise require a narrow viewport or a coarse pointer.
 */

import { platform } from '../platform';
import { id } from './dom';

export type MobileTab = 'classroom' | 'shop';

/** Narrow phones / tablets. Coarse pointer catches landscape phones >900 px wide. */
const NARROW_QUERY = '(max-width: 900px)';
const TOUCH_SHORT_QUERY = '(max-height: 560px) and (pointer: coarse)';

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

function shouldUseMobileLayout(): boolean {
  // CrazyGames SystemInfo is authoritative when the SDK reports a device.
  const device = platform.deviceType;
  if (device === 'mobile' || device === 'tablet') return true;
  if (device === 'desktop') return false;
  return (
    window.matchMedia(NARROW_QUERY).matches || window.matchMedia(TOUCH_SHORT_QUERY).matches
  );
}

export function initMobileTabs(): void {
  const narrow = window.matchMedia(NARROW_QUERY);
  const touchShort = window.matchMedia(TOUCH_SHORT_QUERY);
  const short = window.matchMedia('(max-height: 560px)');
  const tabs = id('mobile-tabs');

  const apply = () => {
    isMobile = shouldUseMobileLayout();
    document.body.classList.toggle('mobile', isMobile);
    document.body.classList.toggle('md-short', isMobile && short.matches);
    tabs.classList.toggle('hidden', !isMobile);
    if (isMobile) {
      setMobileTab(current);
    } else {
      document.body.classList.remove('m-tab-classroom', 'm-tab-shop');
    }
  };

  id('tab-classroom').addEventListener('click', () => setMobileTab('classroom'));
  id('tab-shop').addEventListener('click', () => setMobileTab('shop'));
  narrow.addEventListener('change', apply);
  touchShort.addEventListener('change', apply);
  short.addEventListener('change', apply);
  apply();
}
