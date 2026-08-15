import { adRewardAmount } from '@shared/balance';
import { firstSettledOr, shouldRequestStartupAd } from '../adStartup';
import { platform } from '../platform';
import type { BannerSize } from '../platform/types';
import { store } from '../state';
import { t } from '../i18n';
import { fmt, fmtDuration } from '../format';
import { adPlayIcon, iconDataUrl } from '../render/sprites';
import { el } from './dom';
import { isCovered, onCoverChange, pushOverlay } from './overlay';
import { toast } from './toast';

const BANNER_ID = 'cg-bottom-banner';
/** CrazyGames requires the lower-left banner to refresh every 35 s. */
const BANNER_REFRESH_MS = 35_000;
const BANNER_TICK_MS = 1_000;
/** Inset from the iframe edge so CG never sees a 1px-clipped container. */
const BANNER_EDGE_PAD = 4;
/** Safety net if the SDK never fires adFinished / adError. */
const STARTUP_AD_TIMEOUT_MS = 90_000;

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
 * CrazyGames asked us to hide banners on phones — they eat too much portrait
 * space. Show only when SystemInfo reports tablet or desktop.
 * https://docs.crazygames.com/sdk/user/#system-info
 */
export function bannerAllowedOnDevice(): boolean {
  const device = platform.deviceType;
  if (device === 'mobile') return false;
  if (device === 'tablet' || device === 'desktop') return true;
  // Outside CrazyGames / unknown: skip obvious phones, keep Chromebook/desktop.
  return !window.matchMedia('(max-width: 600px) and (pointer: coarse)').matches;
}

/**
 * QA / screenshot builds can skip the boot midgame via `?noStartupAd=1`.
 * The CrazyGames SDK still frequency-caps (preroll + ~3 min) when we do request.
 */
export function startupAdsDisabled(): boolean {
  try {
    const v = new URLSearchParams(location.search).get('noStartupAd');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/**
 * Request a midgame video ad on every boot, before the player joins.
 * CrazyGames ignores the request when it is too soon after preroll / another
 * video (`adCooldown`) — we still ask every time so later sessions fill.
 */
export async function playStartupVideoAd(): Promise<boolean> {
  if (
    !shouldRequestStartupAd({
      enabled: platform.enabled,
      hasAdblock: platform.hasAdblock,
      disabled: startupAdsDisabled(),
    })
  ) {
    return false;
  }
  const release = mountStartupAdGate();
  try {
    const shown = await firstSettledOr(
      platform.requestMidgameAd({ resumeGameplay: false }),
      STARTUP_AD_TIMEOUT_MS,
      false,
    );
    if (import.meta.env.DEV) {
      console.debug('[ads] startup midgame', shown ? 'shown' : 'skipped');
    }
    return shown;
  } finally {
    release();
  }
}

/** Full-screen blocker while the midgame auction / creative runs (CG requirement). */
function mountStartupAdGate(): () => void {
  const releaseOverlay = pushOverlay();
  const gate = el('div', 'ad-gate');
  gate.id = 'ad-gate';
  gate.setAttribute('role', 'alert');
  gate.setAttribute('aria-live', 'assertive');
  gate.setAttribute('aria-busy', 'true');
  const card = el('div', 'ad-gate-card');
  card.appendChild(adPlayBadge());
  card.appendChild(el('p', 'ad-gate-copy', t('ads.startup')));
  gate.appendChild(card);
  document.body.appendChild(gate);
  document.body.classList.add('ad-gate-open');
  return () => {
    gate.remove();
    document.body.classList.remove('ad-gate-open');
    releaseOverlay();
  };
}

/**
 * Midgame after graduation. Requested from the confirmed "Yes" path only —
 * CrazyGames does not allow clicker midgames on shop / settings navigation.
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
  // Short frames (Chromebook windowed / tablets) always get the slim banner so
  // the slot stays inside the visible classroom instead of overflowing.
  // Phones never reach here — banners are disabled on deviceType === 'mobile'.
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
 * Persistent CrazyGames banner overlaid on the classroom floor (bottom-center).
 *
 * - Nothing is mounted at all when an adblocker is detected, so the layout
 *   falls back to the Basic Launch look with no reserved space.
 * - No board-green chrome around the slot — when the network returns noFill
 *   the dock is hidden so an empty placeholder never sits on screen.
 * - Only one request is in flight at a time (CrazyGames enforces a 30 s
 *   cooldown per container). Refresh every 35 s of uncovered time.
 * - Frame resizes only re-apply the container box; they never request another ad.
 */
export function mountBottomBanner(dock: HTMLElement): () => void {
  if (!platform.enabled || platform.hasAdblock || bannersDisabled()) return () => {};
  // Phones: skip entirely so portrait classroom keeps its height.
  if (!bannerAllowedOnDevice()) return () => {};

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
    return playCol?.clientHeight || dock.clientHeight || window.innerHeight;
  }

  /** Keeps the container at exactly the requested pixel box. */
  const applySize = () => {
    slot.classList.toggle('cg-banner-wide', size.width >= 728);
    slot.classList.toggle('cg-banner-slim', size.width <= 320);
    slot.style.width = `${size.width}px`;
    slot.style.height = `${size.height}px`;
    slot.style.maxWidth = `${size.width}px`;
    slot.style.maxHeight = `${size.height}px`;
    // Notes (chat) sits above the ad so it never covers the CG container —
    // covering it triggers notVisible and breaks load on short Chromebook frames.
    if (playCol) {
      playCol.style.setProperty('--banner-reserve', `${size.height + 4}px`);
      playCol.classList.add('has-banner');
    }
  };

  const clearReserve = () => {
    if (!playCol) return;
    playCol.style.setProperty('--banner-reserve', '0px');
    playCol.classList.remove('has-banner');
  };

  /**
   * CrazyGames rejects containers that are clipped or off-screen. Check against
   * the play column (visible game frame) and the iframe window, with a small
   * inset so 1px subpixel clipping on Chromebooks does not trip notVisible.
   *
   * The bottom edge is allowed to sit flush with the play column (and close to
   * the iframe bottom) — QA wants no gap above the green footer. Top/left/right
   * keep the inset; only reject a bottom that is clearly outside the host/window.
   */
  const fullyVisible = () => {
    const rect = slot.getBoundingClientRect();
    const host = (playCol ?? dock).getBoundingClientRect();
    if (rect.width < size.width - 1 || rect.height < size.height - 1) return false;
    if (rect.top < host.top + BANNER_EDGE_PAD - 1) return false;
    if (rect.left < host.left + BANNER_EDGE_PAD - 1) return false;
    if (rect.right > host.right - BANNER_EDGE_PAD + 1) return false;
    // Flush with play-col bottom is OK (green footer sits below the column).
    if (rect.bottom > host.bottom + 1) return false;
    if (rect.top < BANNER_EDGE_PAD) return false;
    if (rect.left < BANNER_EDGE_PAD) return false;
    if (rect.right > window.innerWidth - BANNER_EDGE_PAD) return false;
    // Allow sitting near the iframe bottom; reject only when past it.
    if (rect.bottom > window.innerHeight + 1) return false;
    return true;
  };

  /** Keep the slot fully inside the play column (centered, clamped). */
  const placeHorizontally = () => {
    const hostW = availableWidth();
    const pad = 8;
    let left = Math.round((hostW - size.width) / 2);
    if (left < pad) left = pad;
    if (left + size.width > hostW - pad) {
      left = Math.max(pad, hostW - pad - size.width);
    }
    dock.style.justifyContent = 'flex-start';
    dock.style.paddingLeft = `${left}px`;
    dock.style.paddingRight = `${pad}px`;
  };

  const request = () => {
    if (inFlight || !slot.isConnected) return;
    // Never request while a modal/tutorial covers the slot (CrazyGames first-banner rule).
    if (isCovered() || document.visibilityState === 'hidden') return;
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
          if (wasHidden && !settled) {
            dock.classList.add('hidden');
            clearReserve();
          }
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
            // Leave the dock visible (sized empty slot) only briefly — hide if
            // we have never successfully filled, so no empty frame sits around.
            if (!settled && wasHidden) {
              dock.classList.add('hidden');
              clearReserve();
            }
            return;
          }
          // empty / noFill
          settled = true;
          dock.classList.add('hidden');
          clearReserve();
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
    // Hidden noFill dock: keep retrying on the refresh cadence, not every tick.
    uncoveredMs += BANNER_TICK_MS;
    if (uncoveredMs >= BANNER_REFRESH_MS) request();
  }, BANNER_TICK_MS);

  // Resizing the game frame must not trigger a new ad request — only reflow.
  const onFrameChange = () => {
    if (!slot.isConnected) return;
    const next = sizeForViewport(availableWidth(), availableHeight());
    // Size class changes are applied visually; the SDK keeps the old creative
    // until the next scheduled refresh.
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
    dock.classList.add('hidden');
    clearReserve();
  };
}
