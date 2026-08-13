/**
 * Phone / tablet layout.
 *
 * Portrait: classroom and School Kiosk each get the full screen, switched with
 * a tab bar. Preferred mobile orientation in the CrazyGames portal (Portrait)
 * so phones are not letterboxed in landscape.
 *
 * Landscape: side-by-side classroom + kiosk (no tabs) so the short height is
 * not eaten by stacked chrome. Legal links stay in Settings. Kept as a
 * fallback if the portal still allows Both.
 *
 * Desktop must keep the side-by-side layout even when the game is not
 * fullscreen — prefer CrazyGames SystemInfo when available; otherwise require
 * a narrow viewport or a coarse pointer.
 */

import { platform } from '../platform';
import { id } from './dom';

export type MobileTab = 'classroom' | 'shop';

/** Narrow phones / tablets. Coarse pointer catches landscape phones >900 px wide. */
const NARROW_QUERY = '(max-width: 900px)';
const TOUCH_SHORT_QUERY = '(max-height: 560px) and (pointer: coarse)';
const LANDSCAPE_QUERY = '(orientation: landscape)';
const SHORT_QUERY = '(max-height: 560px)';

let current: MobileTab = 'classroom';
let isMobile = false;
let isLandscape = false;
const listeners = new Set<(tab: MobileTab) => void>();

export function isMobileLayout(): boolean {
  return isMobile;
}

/** True on mobile landscape where classroom + kiosk share the row. */
export function isLandscapeMobile(): boolean {
  return isMobile && isLandscape;
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
  if (!isMobile || isLandscape) return;
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
  const short = window.matchMedia(SHORT_QUERY);
  const landscape = window.matchMedia(LANDSCAPE_QUERY);
  const tabs = id('mobile-tabs');

  const apply = () => {
    isMobile = shouldUseMobileLayout();
    isLandscape = isMobile && (landscape.matches || window.innerWidth > window.innerHeight);
    document.body.classList.toggle('mobile', isMobile);
    document.body.classList.toggle('md-short', isMobile && short.matches);
    document.body.classList.toggle('md-landscape', isLandscape);

    if (!isMobile) {
      tabs.classList.add('hidden');
      document.body.classList.remove('m-tab-classroom', 'm-tab-shop', 'md-landscape');
      return;
    }

    if (isLandscape) {
      // Side-by-side: both panes visible, no tab bar.
      tabs.classList.add('hidden');
      document.body.classList.remove('m-tab-classroom', 'm-tab-shop');
      for (const fn of listeners) fn(current);
      return;
    }

    tabs.classList.remove('hidden');
    setMobileTab(current);
  };

  id('tab-classroom').addEventListener('click', () => setMobileTab('classroom'));
  id('tab-shop').addEventListener('click', () => setMobileTab('shop'));
  narrow.addEventListener('change', apply);
  touchShort.addEventListener('change', apply);
  short.addEventListener('change', apply);
  landscape.addEventListener('change', apply);
  window.addEventListener('resize', apply);
  apply();
}
