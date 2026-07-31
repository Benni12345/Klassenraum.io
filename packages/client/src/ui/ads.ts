import { adRewardAmount } from '@shared/balance';
import { platform } from '../platform';
import type { BannerSize } from '../platform/types';
import { store } from '../state';
import { t } from '../i18n';
import { fmt, fmtDuration } from '../format';
import { adPlayIcon, iconDataUrl } from '../render/sprites';
import { el } from './dom';
import { isCovered, onCoverChange } from './overlay';
import { toast } from './toast';

const BANNER_ID = 'cg-bottom-banner';
/** CrazyGames requires the lower-left banner to refresh every 35 s. */
const BANNER_REFRESH_MS = 35_000;
const BANNER_TICK_MS = 1_000;

/**
 * Midgame ads are only shown when the player graduates (prestige), after they
 * confirmed the reset — the only placement CrazyGames allows for clicker games.
 */
export function showPrestigeMidgameAd(): void {
  if (!platform.enabled) return;
  void platform.requestMidgameAd().then((shown) => {
    if (import.meta.env.DEV) console.debug('[ads] prestige midgame', shown ? 'shown' : 'skipped');
  });
}

/** Rectangular badge with a play symbol, required on rewarded-ad buttons. */
export function adPlayBadge(): HTMLImageElement {
  const img = el('img');
  img.className = 'ad-play-badge pix';
  img.src = iconDataUrl(adPlayIcon, 3);
  img.alt = '';
  return img;
}

/**
 * Build a prominent rewarded-ad boost control (shop / settings).
 * Shows the video badge, cooldown timer, and adblock state per CG rules.
 */
export function mountRewardedBoostButton(
  parent: HTMLElement,
  opts?: { compact?: boolean },
): () => void {
  if (!platform.enabled) return () => {};

  const wrap = el('div', opts?.compact ? 'ad-boost ad-boost-compact' : 'ad-boost');
  const hint = el('div', 'ad-boost-hint', t('ads.boostHint'));
  const btn = el('button', 'btn gold ad-boost-btn');
  btn.type = 'button';
  const badge = adPlayBadge();
  const label = el('span', 'ad-boost-label', t('settings.adBoost'));
  btn.appendChild(badge);
  btn.appendChild(label);
  wrap.appendChild(hint);
  wrap.appendChild(btn);
  parent.appendChild(wrap);

  let busy = false;

  const refresh = () => {
    if (!btn.isConnected) return;
    if (platform.hasAdblock) {
      btn.disabled = true;
      btn.classList.add('ad-blocked');
      label.textContent = t('settings.adBoostAdblock');
      hint.textContent = t('ads.adblockHint');
      return;
    }
    btn.classList.remove('ad-blocked');
    const readyAt = store.you?.adRewardReadyAt ?? 0;
    const left = readyAt - store.serverNow();
    if (left > 0) {
      btn.disabled = true;
      label.textContent = t('settings.adBoostCooldown', { t: fmtDuration(left) });
      hint.textContent = t('ads.boostHint');
    } else if (!busy) {
      btn.disabled = false;
      label.textContent = t('settings.adBoost');
      hint.textContent = t('ads.boostHint');
    }
  };

  const tick = window.setInterval(refresh, 1_000);
  store.on('you', refresh);
  store.on('joined', refresh);
  refresh();

  btn.onclick = async () => {
    if (btn.disabled || busy) return;
    busy = true;
    btn.disabled = true;
    label.textContent = t('ads.watching');
    const watched = await platform.requestRewardedAd();
    busy = false;
    if (watched) {
      const reward = adRewardAmount(store.you?.bp ?? 0);
      store.claimAdBoost();
      toast(t('settings.adBoostDone', { n: fmt(reward) }), 'gold');
      setTimeout(refresh, 400);
    } else {
      toast(
        platform.hasAdblock ? t('settings.adBoostAdblock') : t('settings.adBoostFail'),
        'info',
      );
      refresh();
    }
  };

  return () => {
    clearInterval(tick);
    wrap.remove();
  };
}

function sizeForViewport(available: number): BannerSize {
  // Phones always get the slim banner.
  if (
    window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(max-height: 560px) and (pointer: coarse)').matches
  ) {
    return { width: 320, height: 50 };
  }
  // Windowed desktop (not fullscreen) often has a short frame — the 728×90
  // leaderboard eats the classroom. Prefer the medium banner unless the frame
  // is clearly spacious.
  const tall = window.innerHeight >= 720;
  if (available >= 900 && tall) return { width: 728, height: 90 };
  if (available >= 500) return { width: 468, height: 60 };
  return { width: 320, height: 50 };
}

/**
 * Persistent CrazyGames banner on the board-green ledge under the classroom.
 *
 * - Nothing is mounted at all when an adblocker is detected, so the layout
 *   falls back to the Basic Launch look with no reserved space.
 * - A new banner is requested on mount and then every 35 s. Frame resizes
 *   (including entering / leaving fullscreen) only re-apply the container box,
 *   they never request another ad.
 */
export function mountBottomBanner(dock: HTMLElement): () => void {
  if (!platform.enabled || platform.hasAdblock) return () => {};

  dock.classList.remove('hidden');
  const slot = el('div', 'cg-banner-slot');
  slot.id = BANNER_ID;
  slot.setAttribute('aria-label', 'Advertisement');
  dock.appendChild(slot);

  let size = sizeForViewport(dock.clientWidth || window.innerWidth);
  let requested = false;
  let uncoveredMs = 0;

  /** Keeps the container at exactly the requested pixel box. */
  const applySize = () => {
    slot.classList.toggle('cg-banner-wide', size.width >= 728);
    slot.classList.toggle('cg-banner-slim', size.width <= 320);
    slot.style.width = `${size.width}px`;
    slot.style.height = `${size.height}px`;
    slot.style.maxWidth = `${size.width}px`;
    slot.style.maxHeight = `${size.height}px`;
  };

  const fullyVisible = () => {
    const rect = slot.getBoundingClientRect();
    return (
      rect.width >= size.width - 1 &&
      rect.height >= size.height - 1 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight + 1 &&
      rect.right <= window.innerWidth + 1
    );
  };

  const request = () => {
    const next = sizeForViewport(dock.clientWidth || window.innerWidth);
    size = next;
    applySize();
    // CrazyGames rejects containers that are clipped or not laid out yet.
    if (!fullyVisible()) {
      if (import.meta.env.DEV) console.debug('[ads] banner slot not fully visible yet');
      return;
    }
    platform.requestBanner(BANNER_ID, size);
    requested = true;
    uncoveredMs = 0;
  };

  applySize();
  // Defer the first request so flex layout settles (avoids notVisible on boot).
  requestAnimationFrame(() => requestAnimationFrame(request));

  // Refresh cadence: only counts time where the banner is actually on screen.
  const tick = window.setInterval(() => {
    if (!slot.isConnected) return;
    if (!requested) {
      request();
      return;
    }
    if (isCovered() || document.visibilityState === 'hidden') return;
    uncoveredMs += BANNER_TICK_MS;
    if (uncoveredMs >= BANNER_REFRESH_MS) request();
  }, BANNER_TICK_MS);

  // Resizing the game frame must not trigger a new ad request.
  const onFrameChange = () => {
    if (slot.isConnected) applySize();
  };
  window.addEventListener('resize', onFrameChange);
  document.addEventListener('fullscreenchange', onFrameChange);
  const stopCoverWatch = onCoverChange(() => onFrameChange());

  return () => {
    clearInterval(tick);
    window.removeEventListener('resize', onFrameChange);
    document.removeEventListener('fullscreenchange', onFrameChange);
    stopCoverWatch();
    platform.clearBanner(BANNER_ID);
    slot.remove();
    dock.classList.add('hidden');
  };
}
