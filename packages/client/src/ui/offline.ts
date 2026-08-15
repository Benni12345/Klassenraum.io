/**
 * Welcome-back: offer to double offline earnings for a rewarded ad.
 * CrazyGames' highest-converting idle placement — the HS is already on the desk.
 */

import { sfxSuccess } from '../audio';
import { fmt, fmtDuration } from '../format';
import { t } from '../i18n';
import { platform } from '../platform';
import { store } from '../state';
import { adPlayBadge } from './ads';
import { el } from './dom';
import { openModal, toast } from './modals';
import { isCovered } from './overlay';
import { maybePromptSchool } from './school';

let prompted = false;

/** True when the welcome-back modal was opened (School Day should wait). */
export function maybePromptWelcomeBack(): boolean {
  if (prompted) return false;
  const offer = store.pendingOffline;
  if (!offer || !(offer.bp > 0) || offer.ms < 60_000) return false;
  prompted = true;
  store.pendingOffline = null;
  welcomeBackModal(offer, {
    onClose: () => {
      maybePromptSchool();
      if (store.you && store.status === 'open' && !isCovered()) platform.onGameplayStart();
    },
  });
  return true;
}

function welcomeBackModal(
  offer: { ms: number; bp: number },
  opts: { onClose: () => void },
): void {
  const doubled = offer.bp * 2;
  openModal({ title: t('offline.title'), onClose: opts.onClose }, (body, foot, close) => {
    body.appendChild(el('p', '', t('offline.desc', { v: fmt(offer.bp), t: fmtDuration(offer.ms) })));

    const keep = el('button', 'btn', t('offline.keep', { v: fmt(offer.bp) }));
    keep.type = 'button';
    keep.onclick = close;

    if (!platform.enabled) {
      foot.appendChild(keep);
      return;
    }

    const dbl = el('button', 'btn gold ad-boost-btn');
    dbl.type = 'button';
    dbl.appendChild(adPlayBadge());
    const label = el('span', '', t('offline.double', { v: fmt(doubled) }));
    dbl.appendChild(label);
    if (platform.hasAdblock) {
      dbl.disabled = true;
      dbl.classList.add('ad-blocked');
      label.textContent = t('settings.adBoostAdblock');
    }
    dbl.onclick = async () => {
      if (dbl.disabled) return;
      dbl.disabled = true;
      label.textContent = t('ads.watching');
      const watched = await watchAd();
      if (!watched) {
        dbl.disabled = platform.hasAdblock;
        label.textContent = t('offline.double', { v: fmt(doubled) });
        return;
      }
      store.doubleOffline();
      sfxSuccess();
      toast(t('offline.doubleDone', { n: fmt(offer.bp) }), 'gold');
      close();
    };
    foot.appendChild(keep);
    foot.appendChild(dbl);
  });
}

async function watchAd(): Promise<boolean> {
  if (!platform.enabled) return true;
  if (platform.hasAdblock) {
    toast(t('settings.adBoostAdblock'), 'info');
    return false;
  }
  const watched = await platform.requestRewardedAd();
  if (!watched) toast(t('settings.adBoostFail'), 'info');
  return watched;
}
