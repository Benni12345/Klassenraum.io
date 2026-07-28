import { adRewardAmount } from '@shared/balance';
import { platform } from '../platform';
import { store } from '../state';
import { t } from '../i18n';
import { fmt, fmtDuration } from '../format';
import { el } from './dom';
import { toast } from './toast';

const SHOP_BANNER_ID = 'cg-shop-banner';
/** Match CrazyGames midroll pacing so QA isn't flooded with midgame adError. */
const MIDGAME_MIN_GAP_MS = 3 * 60_000;
let lastMidgameAt = 0;

/** Safe midgame request — SDK ignores early calls; we also throttle client-side. */
export function tryMidgameAd(reason: string): void {
  if (!platform.enabled) return;
  const now = Date.now();
  if (now - lastMidgameAt < MIDGAME_MIN_GAP_MS) return;
  lastMidgameAt = now;
  void platform.requestMidgameAd().then((shown) => {
    if (shown) lastMidgameAt = Date.now();
    if (import.meta.env.DEV) console.debug('[ads] midgame', reason, shown ? 'shown' : 'skipped');
  });
}

/** Call after a rewarded finishes so midgame waits for SDK pacing. */
export function noteRewardedShown(): void {
  lastMidgameAt = Date.now();
}

/**
 * Build a prominent rewarded-ad boost control (shop / settings).
 * Shows video affordance, cooldown timer, and adblock state per CG rules.
 */
export function mountRewardedBoostButton(parent: HTMLElement, opts?: { compact?: boolean }): () => void {
  if (!platform.enabled) return () => {};

  const wrap = el('div', opts?.compact ? 'ad-boost ad-boost-compact' : 'ad-boost');
  const hint = el('div', 'ad-boost-hint', t('ads.boostHint'));
  const btn = el('button', 'btn gold ad-boost-btn', `▶ ${t('settings.adBoost')}`);
  btn.type = 'button';
  wrap.appendChild(hint);
  wrap.appendChild(btn);
  parent.appendChild(wrap);

  let busy = false;

  const refresh = () => {
    if (!btn.isConnected) return;
    if (platform.hasAdblock) {
      btn.disabled = true;
      btn.classList.add('ad-blocked');
      btn.textContent = t('settings.adBoostAdblock');
      hint.textContent = t('ads.adblockHint');
      return;
    }
    btn.classList.remove('ad-blocked');
    const readyAt = store.you?.adRewardReadyAt ?? 0;
    const left = readyAt - store.serverNow();
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = t('settings.adBoostCooldown', {
        t: fmtDuration(left),
      });
      hint.textContent = t('ads.boostHint');
    } else if (!busy) {
      btn.disabled = false;
      btn.textContent = `▶ ${t('settings.adBoost')}`;
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
    btn.textContent = t('ads.watching');
    const watched = await platform.requestRewardedAd();
    busy = false;
    if (watched) {
      const reward = adRewardAmount(store.you?.bp ?? 0);
      store.claimAdBoost();
      noteRewardedShown();
      toast(t('settings.adBoostDone'), 'gold');
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

/**
 * Persistent CrazyGames banner in the bottom-center dock (not the shop).
 * Desktop uses 728×90 so the kiosk keeps vertical space; mobile uses 320×50.
 */
export function mountShopBanner(parent: HTMLElement): () => void {
  if (!platform.enabled) return () => {};

  const slot = el('div', 'cg-banner-slot cg-dock-banner');
  slot.id = SHOP_BANNER_ID;
  slot.setAttribute('aria-label', 'Advertisement');
  // Explicit pixel box required by CrazyGames (notVisible / invalidSize otherwise).
  slot.style.width = '728px';
  slot.style.height = '90px';
  parent.appendChild(slot);

  const sizeForViewport = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      return { width: 320, height: 50 };
    }
    // Leaderboard size fits a bottom strip without crushing the classroom/shop.
    return { width: 728, height: 90 };
  };

  let requested = false;
  const request = () => {
    const size = sizeForViewport();
    slot.classList.toggle('cg-dock-banner-slim', size.height <= 60);
    slot.style.width = `${size.width}px`;
    slot.style.height = `${size.height}px`;
    // Wait until the slot is fully on-screen — CG rejects partially clipped containers.
    const rect = slot.getBoundingClientRect();
    const fullyVisible =
      rect.width >= size.width - 1 &&
      rect.height >= size.height - 1 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight + 1 &&
      rect.right <= window.innerWidth + 1;
    if (!fullyVisible) {
      if (import.meta.env.DEV) console.debug('[ads] dock banner not fully visible yet');
      return;
    }
    platform.showBanner(SHOP_BANNER_ID, size);
    requested = true;
  };

  // Defer first request so layout/flex settles (avoids notVisible on boot).
  requestAnimationFrame(() => requestAnimationFrame(request));
  window.setTimeout(request, 1500);

  const refresh = window.setInterval(() => {
    if (!slot.isConnected) return;
    request();
  }, 60_000);

  const onResize = () => {
    if (!slot.isConnected) return;
    request();
  };
  window.addEventListener('resize', onResize);

  // Retry once after join when the dock is definitely painted.
  store.on('joined', () => {
    if (!requested) window.setTimeout(request, 500);
  });

  return () => {
    clearInterval(refresh);
    window.removeEventListener('resize', onResize);
    platform.hideBanner(SHOP_BANNER_ID);
    slot.remove();
  };
}
