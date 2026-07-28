import { adRewardAmount } from '@shared/balance';
import { platform } from '../platform';
import { store } from '../state';
import { t } from '../i18n';
import { fmt, fmtDuration } from '../format';
import { el } from './dom';
import { toast } from './toast';

const SHOP_BANNER_ID = 'cg-shop-banner';

/** Safe midgame request — SDK ignores it if too soon / Basic Launch. */
export function tryMidgameAd(reason: string): void {
  if (!platform.enabled) return;
  void platform.requestMidgameAd().then((shown) => {
    if (import.meta.env.DEV && shown) console.debug('[ads] midgame shown:', reason);
  });
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

/** Persistent banner in the school kiosk (shop UI, not the canvas). */
export function mountShopBanner(parent: HTMLElement): () => void {
  if (!platform.enabled) return () => {};

  const slot = el('div', 'cg-banner-slot cg-shop-banner');
  slot.id = SHOP_BANNER_ID;
  slot.setAttribute('aria-label', 'Advertisement');
  parent.appendChild(slot);

  const sizeForViewport = () => {
    // Tall rectangle on desktop shop; leaderboard-style strip on narrow/mobile.
    if (window.matchMedia('(max-width: 900px)').matches) {
      return { width: 320, height: 50 };
    }
    return { width: 300, height: 250 };
  };

  const request = () => {
    const size = sizeForViewport();
    slot.classList.toggle('cg-shop-banner-slim', size.height <= 100);
    platform.showBanner(SHOP_BANNER_ID, size);
  };
  request();

  const refresh = window.setInterval(() => {
    if (!slot.isConnected) return;
    request();
  }, 60_000);

  const onResize = () => {
    if (!slot.isConnected) return;
    request();
  };
  window.addEventListener('resize', onResize);

  return () => {
    clearInterval(refresh);
    window.removeEventListener('resize', onResize);
    platform.hideBanner(SHOP_BANNER_ID);
    slot.remove();
  };
}
