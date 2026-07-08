import {
  GENERATORS,
  genCost,
  genMult,
  maxAffordable,
  UPGRADES,
  type UpgradeDef,
} from '@shared/balance';
import { fmt } from '../format';
import { t } from '../i18n';
import { genIcon, iconDataUrl } from '../render/sprites';
import { store } from '../state';
import { el, id } from './dom';

let qtySel = 1;

interface GenRow {
  root: HTMLButtonElement;
  count: HTMLElement;
  cost: HTMLElement;
  sub: HTMLElement;
  name: HTMLElement;
}

const rows: GenRow[] = [];
let upgradeSig = '';

export function initShop(): void {
  const list = id('gen-list');
  GENERATORS.forEach((g, gi) => {
    const root = el('button', 'gen locked');
    const icon = el('div', 'icon');
    const img = el('img');
    img.src = iconDataUrl(genIcon(gi), 6);
    img.alt = '';
    icon.appendChild(img);
    const mid = el('div');
    const name = el('div', 'name', '???');
    const sub = el('div', 'sub', '');
    mid.appendChild(name);
    mid.appendChild(sub);
    const right = el('div', 'right');
    const count = el('div', 'count', '0');
    const cost = el('div', 'cost', fmt(g.baseCost));
    right.appendChild(count);
    right.appendChild(cost);
    root.appendChild(icon);
    root.appendChild(mid);
    root.appendChild(right);
    root.onclick = () => store.buy(gi, qtySel);
    list.appendChild(root);
    rows.push({ root, count, cost, sub, name });
  });

  for (const btn of id('buy-qty').querySelectorAll<HTMLButtonElement>('.qty')) {
    btn.onclick = () => {
      qtySel = Number(btn.dataset.qty);
      for (const b of id('buy-qty').querySelectorAll('.qty')) b.classList.remove('on');
      btn.classList.add('on');
      refresh();
    };
  }

  store.on('you', refresh);
  store.on('joined', refresh);
  setInterval(refresh, 250);
}

function refresh(): void {
  const you = store.you;
  if (!you) return;

  let maxUnlocked = 0;
  GENERATORS.forEach((_, gi) => {
    if ((you.gens[gi] ?? 0) > 0) maxUnlocked = gi + 1;
  });

  GENERATORS.forEach((g, gi) => {
    const row = rows[gi]!;
    const owned = you.gens[gi] ?? 0;
    // Progressive reveal: everything up to one tier past the highest owned.
    const revealed = gi <= maxUnlocked;
    row.root.classList.toggle('locked', !revealed);
    if (!revealed) {
      row.name.textContent = '???';
      row.sub.textContent = '';
      row.count.textContent = '';
      row.cost.textContent = fmt(g.baseCost);
      row.root.disabled = true;
      return;
    }
    const genName = t(`gen.${g.id}.name`);
    if (row.name.textContent !== genName) {
      row.name.textContent = genName;
      row.root.title = t(`gen.${g.id}.flavor`);
    }
    const qty = qtySel === -1 ? Math.max(1, maxAffordable(gi, owned, you.bp)) : qtySel;
    const cost = genCost(gi, owned, qty);
    const each = g.baseBps * genMult(gi, you.upgrades);
    row.sub.textContent = `${fmt(each)}/s ${qtySel === -1 ? `×${qty}` : qty > 1 ? `×${qty}` : ''}`;
    row.count.textContent = owned > 0 ? `×${owned}` : '';
    row.cost.textContent = fmt(cost);
    const afford = you.bp >= cost;
    row.root.classList.toggle('afford', afford);
    row.root.disabled = !afford;
  });

  refreshUpgrades();
}

function upgradeName(u: UpgradeDef): string {
  if (u.kind === 'click') return t(`upgrade.click${u.id.slice(-1)}.name`);
  const g = GENERATORS[u.gen]!;
  return t('upgrade.gen.name', { gen: t(`gen.${g.id}.name`) });
}

function upgradeDesc(u: UpgradeDef): string {
  if (u.kind === 'click') return t('upgrade.click.desc');
  const g = GENERATORS[u.gen]!;
  return t('upgrade.gen.desc', { gen: t(`gen.${g.id}.name`), n: u.threshold });
}

function refreshUpgrades(): void {
  const you = store.you;
  if (!you) return;
  const available = UPGRADES.filter((u) => {
    if (you.upgrades.includes(u.id)) return false;
    return u.kind === 'gen' ? (you.gens[u.gen] ?? 0) >= u.threshold : you.clicks >= u.threshold;
  }).slice(0, 10);

  const wrap = id('upgrade-row-wrap');
  wrap.classList.toggle('hidden', available.length === 0);

  const sig = available.map((u) => u.id).join(',');
  const box = id('upgrade-row');
  if (sig !== upgradeSig) {
    upgradeSig = sig;
    box.innerHTML = '';
    for (const u of available) {
      const b = el('button', 'upgrade-btn');
      b.dataset.uid = u.id;
      b.dataset.cost = String(u.cost);
      const img = el('img');
      img.src = iconDataUrl(u.kind === 'gen' ? genIcon(u.gen) : genIcon(0), 5);
      img.alt = '';
      b.appendChild(img);
      b.appendChild(el('span', 'cost', fmt(u.cost)));
      b.title = `${upgradeName(u)} — ${upgradeDesc(u)} (${fmt(u.cost)} ${t('unit')})`;
      b.onclick = () => store.buyUpgrade(u.id);
      box.appendChild(b);
    }
  }
  for (const b of box.querySelectorAll<HTMLButtonElement>('.upgrade-btn')) {
    const cant = you.bp < Number(b.dataset.cost);
    b.classList.toggle('cant', cant);
    b.disabled = cant;
  }
}
