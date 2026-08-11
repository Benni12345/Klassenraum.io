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
/** Inset from the iframe edge so CG never sees a 1px-clipped container. */
const BANNER_EDGE_PAD = 4;

/**
 * QA / test builds can disable banners via `VITE_NO_BANNER=true` at build time
 * or `?noBanner=1` at runtime. Layout then matches the no-adblocker Basic Launch
 * look (no reserved banner ledge).
 */
export function bannersDisabled(): boolean {
  if (import.meta.env.VITE_NO_BANNER === 'true') return true;
  try {
    const v = new URLSearchParams(location.search).get('noBanner');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

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

function sizeForViewport(available: number, availableHeight: number): BannerSize {
  // Short frames (Chromebook windowed / phones) always get the slim banner so
  // the slot stays inside the visible classroom instead of overflowing.
  const short =
    availableHeight < 560 ||
    window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(max-height: 560px) and (pointer: coarse)').matches;
  if (short) return { width: 320, height: 50 };
  // Windowed desktop (not fullscreen) often has a short frame — the 728×90
  // leaderboard eats the classroom. Prefer the medium banner unless the frame
  // is clearly spacious.
  const tall = availableHeight >= 720;
  if (available >= 900 && tall) return { width: 728, height: 90 };
  if (available >= 500) return { width: 468, height: 60 };
  return { width: 320, height: 50 };
}

/**
 * Persistent CrazyGames banner on a transparent ledge under the classroom.
 *
 * - Nothing is mounted at all when an adblocker is detected, so the layout
 *   falls back to the Basic Launch look with no reserved space.
 * - The dock is in normal document flow (not absolutely overlaid) so short
 *   CrazyGames / Chromebook iframes never clip the slot at the frame edge.
 * - No board-green chrome — when the network returns noFill the dock is hidden
 *   and the classroom recovers the height.
 * - Only one request is in flight at a time (CrazyGames enforces a 30 s
 *   cooldown per container). Refresh every 35 s of uncovered time.
 * - Frame resizes only re-apply the container box; they never request another ad.
 */
export function mountBottomBanner(dock: HTMLElement): () => void {
  if (!platform.enabled || platform.hasAdblock || bannersDisabled()) return () => {};

  const playCol = dock.parentElement;
  dock.classList.remove('hidden');
  const slot = el('div', 'cg-banner-slot');
  slot.id = BANNER_ID;
  slot.setAttribute('aria-label', 'Advertisement');
  dock.appendChild(slot);

  let size = sizeForViewport(availableWidth(), availableHeight());
  /** True once we have successfully handed a request to the SDK (or cooldown). */
  let settled = false;
  let inFlight = false;
  let uncoveredMs = 0;

  function availableWidth(): number {
    return dock.clientWidth || playCol?.clientWidth || window.innerWidth;
  }

  function availableHeight(): number {
    // Prefer the full game frame height so size picks stay stable whether or
    // not the dock is currently reserving space.
    return (
      playCol?.parentElement?.clientHeight ||
      playCol?.clientHeight ||
      window.innerHeight
    );
  }

  /** Keeps the container at exactly the requested pixel box. */
  const applySize = () => {
    slot.classList.toggle('cg-banner-wide', size.width >= 728);
    slot.classList.toggle('cg-banner-slim', size.width <= 320);
    slot.style.width = `${size.width}px`;
    slot.style.height = `${size.height}px`;
    slot.style.maxWidth = `${size.width}px`;
    slot.style.maxHeight = `${size.height}px`;
  };

  /**
   * CrazyGames rejects containers that are clipped or off-screen. Check against
   * the iframe window with a small inset so 1px subpixel clipping does not trip
   * notVisible.
   */
  const fullyVisible = () => {
    const rect = slot.getBoundingClientRect();
    if (rect.width < size.width - 1 || rect.height < size.height - 1) return false;
    if (rect.top < BANNER_EDGE_PAD) return false;
    if (rect.left < BANNER_EDGE_PAD) return false;
    if (rect.bottom > window.innerHeight - BANNER_EDGE_PAD) return false;
    if (rect.right > window.innerWidth - BANNER_EDGE_PAD) return false;
    return true;
  };

  /** Center the slot; clamp so a wide creative never overflows a narrow column. */
  const placeHorizontally = () => {
    dock.style.justifyContent = 'center';
    dock.style.paddingLeft = '';
    dock.style.paddingRight = '';
  };

  const hideDock = () => {
    dock.classList.add('hidden');
  };

  const request = () => {
    if (inFlight || !slot.isConnected) return;
    const next = sizeForViewport(availableWidth(), availableHeight());
    size = next;
    // Reveal the dock before measuring / requesting so CrazyGames sees a
    // fully visible container (hidden empty docks are re-shown each refresh).
    const wasHidden = dock.classList.contains('hidden');
    dock.classList.remove('hidden');
    applySize();
    placeHorizontally();
    inFlight = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!slot.isConnected) {
          inFlight = false;
          return;
        }
        // CrazyGames rejects containers that are clipped or not laid out yet.
        if (!fullyVisible()) {
          if (import.meta.env.DEV) console.debug('[ads] banner slot not fully visible yet');
          inFlight = false;
          if (wasHidden && !settled) hideDock();
          return;
        }
        void platform.requestBanner(BANNER_ID, size).then((result) => {
          inFlight = false;
          uncoveredMs = 0;
          if (result === 'filled') {
            settled = true;
            dock.classList.remove('hidden');
            applySize();
            return;
          }
          if (result === 'retry') {
            // Keep unsettled so the 1 s tick retries after layout settles.
            if (!settled && wasHidden) hideDock();
            return;
          }
          // empty / noFill — release the ledge so the classroom recovers height.
          settled = true;
          hideDock();
        });
      });
    });
  };

  applySize();
  placeHorizontally();
  // Defer the first request so flex layout settles (avoids notVisible on boot).
  requestAnimationFrame(() => requestAnimationFrame(request));

  // Refresh cadence: only counts time where the banner is actually on screen.
  // Never start a second request while one is in flight (CG 30s cooldown).
  const tick = window.setInterval(() => {
    if (!slot.isConnected || inFlight) return;
    if (!settled) {
      request();
      return;
    }
    if (isCovered() || document.visibilityState === 'hidden') return;
    uncoveredMs += BANNER_TICK_MS;
    if (uncoveredMs >= BANNER_REFRESH_MS) request();
  }, BANNER_TICK_MS);

  // Resizing the game frame must not trigger a new ad request — only reflow.
  const onFrameChange = () => {
    if (!slot.isConnected) return;
    const next = sizeForViewport(availableWidth(), availableHeight());
    size = next;
    applySize();
    placeHorizontally();
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
    hideDock();
  };
}
