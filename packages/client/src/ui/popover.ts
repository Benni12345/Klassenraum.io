import { GENERATORS, stealAmount, STEAL_COOLDOWN_MS } from '@shared/balance';
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

type Tab = 'overview' | 'gens' | 'steal';

/** Popover when clicking a classmate: peek + steal. */
export function showDeskPopover(hit: DeskHit): void {
  closePopover();
  const root = id('popover-root');
  const pop = el('div', 'popover wide');
  const targetId = hit.player.id;
  let tab: Tab = 'overview';

  const tabs = el('div', 'popover-tabs');
  const tabOverview = el('button', 'tab on');
  const tabGens = el('button', 'tab');
  const tabSteal = el('button', 'tab');
  tabOverview.textContent = t('peek.tab.overview');
  tabGens.textContent = t('peek.tab.gens');
  tabSteal.textContent = t('peek.tab.steal');
  tabs.append(tabOverview, tabGens, tabSteal);

  const body = el('div', 'popover-body');
  pop.appendChild(tabs);
  pop.appendChild(body);

  const setTab = (next: Tab) => {
    tab = next;
    tabOverview.classList.toggle('on', tab === 'overview');
    tabGens.classList.toggle('on', tab === 'gens');
    tabSteal.classList.toggle('on', tab === 'steal');
    refresh();
  };
  tabOverview.onclick = () => setTab('overview');
  tabGens.onclick = () => setTab('gens');
  tabSteal.onclick = () => setTab('steal');

  const refresh = () => {
    const p = store.roster.get(targetId);
    const you = store.you;
    if (!p || !you) {
      closePopover();
      return;
    }
    body.replaceChildren();

    if (tab === 'overview') {
      const title = el('div', 'pname');
      title.textContent = `${p.name} — ${gradeLabel(p.grade)}${p.stars > 0 ? ` ★${p.stars}` : ''}`;
      const sub = el('div', 'psub');
      sub.textContent = `${fmt(p.bps)} ${t('unit')}/s · ${fmt(p.bp)} ${t('misc.onHand')}`;
      const status = el('div', 'peek-line');
      if (!p.online) status.textContent = t('misc.sleeping');
      else if (p.pose === 'walking') status.textContent = t('peek.walking');
      else if (p.detention) status.textContent = t('buff.detention');
      else status.textContent = t('peek.atDesk');
      const tier = el('div', 'peek-line');
      tier.textContent = t('peek.deskTier', { n: p.deskTier });
      body.append(title, sub, status, tier);
      return;
    }

    if (tab === 'gens') {
      const title = el('div', 'pname');
      title.textContent = t('peek.gensTitle');
      body.appendChild(title);
      if (p.topGens.length === 0) {
        const empty = el('div', 'peek-line');
        empty.textContent = t('peek.noGens');
        body.appendChild(empty);
        return;
      }
      for (const gi of p.topGens) {
        const g = GENERATORS[gi];
        if (!g) continue;
        const row = el('div', 'peek-gen');
        row.textContent = t(`gen.${g.id}.name`);
        body.appendChild(row);
      }
      return;
    }

    const warn = el('div', 'warn');
    const btn = el('button', 'btn');
    btn.onclick = () => {
      store.steal(targetId);
      closePopover();
    };

    const sn = store.serverNow();
    const cooldownLeft = you.stealReadyAt - sn;
    const youPub = store.roster.get(you.id);
    if (!p.online) {
      btn.disabled = true;
      btn.textContent = t('steal.sleeping');
    } else if (youPub?.pose === 'walking') {
      btn.disabled = true;
      btn.textContent = t('steal.mustSit');
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
    body.append(btn, warn);
  };

  refresh();
  const timer = setInterval(refresh, 300);

  root.appendChild(pop);
  const w = 250;
  const x = Math.max(8, Math.min(hit.screenX - w / 2, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(hit.screenY + 12, window.innerHeight - 180));
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
