import {
  INK_COOLDOWN_MS,
  pvpActionReadyAt,
  SPIT_COOLDOWN_MS,
  spitAmount,
  STEAL_COOLDOWN_MS,
  stealAmount,
} from '@shared/balance';
import { fmt, fmtDuration } from '../format';
import { gradeLabel, t } from '../i18n';
import type { DeskHit } from '../render/scene';
import { store } from '../state';
import { el, id } from './dom';

let cleanup: (() => void) | null = null;

export function closePopover(): void {
  cleanup?.();
  cleanup = null;
}

function actionReadyAt(stored: number, baseCd: number): number {
  return pvpActionReadyAt(stored, baseCd, store.event?.kind);
}

/** Popover shown when clicking a classmate's desk: inspect + PvP actions. */
export function showDeskPopover(hit: DeskHit): void {
  closePopover();
  const root = id('popover-root');
  const pop = el('div', 'popover');
  const targetId = hit.player.id;

  const name = el('div', 'pname');
  const sub = el('div', 'psub');
  const actions = el('div', 'pvp-actions');
  const planeBtn = el('button', 'btn');
  const spitBtn = el('button', 'btn small');
  const inkBtn = el('button', 'btn small');
  const warn = el('div', 'warn');
  actions.appendChild(planeBtn);
  actions.appendChild(spitBtn);
  actions.appendChild(inkBtn);
  pop.appendChild(name);
  pop.appendChild(sub);
  pop.appendChild(actions);
  pop.appendChild(warn);

  planeBtn.onclick = () => {
    store.steal(targetId);
    closePopover();
  };
  spitBtn.onclick = () => {
    store.spitball(targetId);
    closePopover();
  };
  inkBtn.onclick = () => {
    store.ink(targetId);
    closePopover();
  };

  const refresh = () => {
    const p = store.roster.get(targetId);
    const you = store.you;
    if (!p || !you) {
      closePopover();
      return;
    }
    name.textContent = `${p.name} — ${gradeLabel(p.grade)}${p.stars > 0 ? ` ★${p.stars}` : ''}`;
    const tags: string[] = [];
    if (!p.online) tags.push(t('misc.sleeping'));
    else {
      if (p.busy) tags.push(t('steal.busy'));
      if (p.inked) tags.push(t('steal.inked'));
    }
    sub.textContent = `${fmt(p.bp)} ${t('unit')} ${t('misc.onHand')}${
      tags.length ? ` · ${tags.join(' · ')}` : ''
    }`;

    const sn = store.serverNow();
    const detained = you.detentionUntil > sn;
    const sleeping = !p.online;
    const recess = store.event?.kind === 'recess';
    const patrol = store.event?.kind === 'patrol';

    const planeAt = actionReadyAt(you.stealReadyAt, STEAL_COOLDOWN_MS);
    const spitAt = actionReadyAt(you.spitReadyAt, SPIT_COOLDOWN_MS);
    const inkAt = actionReadyAt(you.inkReadyAt, INK_COOLDOWN_MS);
    const revenge =
      you.revengeTargetId === targetId && you.revengeReadyAt > 0 && !sleeping && !detained;
    const revengeLeft = you.revengeReadyAt - sn;
    const planeLeft = planeAt - sn;
    const planeReady = !sleeping && !detained && (planeLeft <= 0 || (revenge && revengeLeft <= 0));

    planeBtn.disabled = sleeping || detained || !planeReady;
    spitBtn.disabled = sleeping || detained || spitAt > sn;
    inkBtn.disabled = sleeping || detained || inkAt > sn;

    if (sleeping) {
      planeBtn.textContent = t('steal.sleeping');
      spitBtn.textContent = t('steal.sleeping');
      inkBtn.textContent = t('steal.sleeping');
    } else if (detained) {
      planeBtn.textContent = t('err.detention');
      spitBtn.textContent = t('err.detention');
      inkBtn.textContent = t('err.detention');
    } else {
      if (planeReady) {
        const revengeTag = revenge && planeLeft > 0 ? ` · ${t('steal.revenge')}` : '';
        planeBtn.textContent = `${t('steal.throw')} (${t('steal.steals', {
          v: fmt(stealAmount(p.bp, you.bps)),
        })})${revengeTag}`;
      } else if (revenge && revengeLeft > 0) {
        planeBtn.textContent = t('steal.revengeIn', { t: fmtDuration(revengeLeft) });
      } else {
        planeBtn.textContent = t('steal.cooldown', { t: fmtDuration(planeLeft) });
      }
      spitBtn.textContent =
        spitAt > sn
          ? t('steal.spitCooldown', { t: fmtDuration(spitAt - sn) })
          : `${t('steal.spit')} (${t('steal.steals', { v: fmt(spitAmount(p.bp, you.bps)) })})`;
      inkBtn.textContent =
        inkAt > sn ? t('steal.inkCooldown', { t: fmtDuration(inkAt - sn) }) : t('steal.ink');
    }

    planeBtn.classList.toggle('gold', Boolean(revenge && planeReady && !sleeping && !detained));
    const warnBits: string[] = [];
    if (p.busy) warnBits.push(t('steal.busyHint'));
    if (patrol) warnBits.push(t('steal.risky'));
    if (recess) warnBits.push(t('steal.recessHint'));
    warn.textContent = warnBits.join(' ');
  };
  refresh();
  const timer = setInterval(refresh, 300);

  root.appendChild(pop);
  const w = 260;
  const x = Math.max(8, Math.min(hit.screenX - w / 2, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(hit.screenY + 12, window.innerHeight - 220));
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;

  const onDown = (ev: PointerEvent) => {
    if (!pop.contains(ev.target as Node)) closePopover();
  };
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);

  cleanup = () => {
    clearInterval(timer);
    document.removeEventListener('pointerdown', onDown, true);
    pop.remove();
  };
}

export { STEAL_COOLDOWN_MS };
