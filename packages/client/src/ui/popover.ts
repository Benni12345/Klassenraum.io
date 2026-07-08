import { stealAmount, STEAL_COOLDOWN_MS } from '@shared/balance';
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

/** Popover shown when clicking a classmate's desk: inspect + throw airplane. */
export function showDeskPopover(hit: DeskHit): void {
  closePopover();
  const root = id('popover-root');
  const pop = el('div', 'popover');
  const targetId = hit.player.id;

  const name = el('div', 'pname');
  const sub = el('div', 'psub');
  const btn = el('button', 'btn');
  const warn = el('div', 'warn');
  pop.appendChild(name);
  pop.appendChild(sub);
  pop.appendChild(btn);
  pop.appendChild(warn);

  btn.onclick = () => {
    store.steal(targetId);
    closePopover();
  };

  const refresh = () => {
    const p = store.roster.get(targetId);
    const you = store.you;
    if (!p || !you) {
      closePopover();
      return;
    }
    name.textContent = `${p.name} — ${gradeLabel(p.grade)} ★${p.stars}`;
    sub.textContent = `${fmt(p.bp)} ${t('unit')} ${t('misc.onHand')}${p.online ? '' : ` · ${t('misc.sleeping')}`}`;

    const sn = store.serverNow();
    const cooldownLeft = you.stealReadyAt - sn;
    if (!p.online) {
      btn.disabled = true;
      btn.textContent = t('steal.sleeping');
    } else if (you.detentionUntil > sn) {
      btn.disabled = true;
      btn.textContent = t('err.detention');
    } else if (cooldownLeft > 0) {
      btn.disabled = true;
      btn.textContent = t('steal.cooldown', { t: fmtDuration(cooldownLeft) });
    } else {
      btn.disabled = false;
      btn.textContent = `${t('steal.throw')} (${t('steal.steals', {
        v: fmt(stealAmount(p.bp, you.bps)),
      })})`;
    }
    warn.textContent = store.event?.kind === 'patrol' ? t('steal.risky') : '';
  };
  refresh();
  const timer = setInterval(refresh, 300);

  root.appendChild(pop);
  const w = 230;
  const x = Math.max(8, Math.min(hit.screenX - w / 2, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(hit.screenY + 12, window.innerHeight - 140));
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

// Re-exported so main.ts can mention the cooldown in ui copy if needed.
export { STEAL_COOLDOWN_MS };
