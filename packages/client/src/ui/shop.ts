import {
  GENERATORS,
  genCost,
  genMult,
  maxAffordable,
  UPGRADE_BY_ID,
  UPGRADES,
  type UpgradeDef,
} from '@shared/balance';
import { fmt } from '../format';
import { t } from '../i18n';
import { genIcon, iconDataUrl } from '../render/sprites';
import { store } from '../state';
import { el, id } from './dom';
import { bindCursorTip, type TipCard } from './tooltip';

let qtySel = 1;

interface GenRow {
  root: HTMLButtonElement;
  owned: HTMLElement;
  rate: HTMLElement;
  cost: HTMLElement;
  name: HTMLElement;
  gi: number;
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

    const mid = el('div', 'gen-mid');
    const name = el('div', 'gen-name', '???');
    const stats = el('div', 'gen-stats');
    const owned = el('span', 'gen-owned hidden');
    const rate = el('span', 'gen-rate', '');
    stats.appendChild(owned);
    stats.appendChild(rate);
    mid.appendChild(name);
    mid.appendChild(stats);

    const right = el('div', 'gen-right');
    const cost = el('div', 'gen-cost', fmt(g.baseCost));
    right.appendChild(cost);

    root.appendChild(icon);
    root.appendChild(mid);
    root.appendChild(right);
    root.onclick = () => tryBuyGen(gi);
    bindCursorTip(root, () => genTip(gi));
    list.appendChild(root);
    rows.push({ root, owned, rate, cost, name, gi });
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

function tryBuyGen(gi: number): void {
  const you = store.you;
  if (!you) return;
  const owned = you.gens[gi] ?? 0;
  const { qty, cost } = resolveBuyQty(gi, owned, you.bp);
  if (qty > 0 && you.bp >= cost) store.buy(gi, qtySel);
}

function resolveBuyQty(gi: number, owned: number, bp: number): { qty: number; cost: number } {
  const qty = qtySel === -1 ? Math.max(1, maxAffordable(gi, owned, bp)) : qtySel;
  return { qty, cost: genCost(gi, owned, qty) };
}

function isGenRevealed(gi: number, you: NonNullable<typeof store.you>): boolean {
  let maxUnlocked = 0;
  for (let i = 0; i < GENERATORS.length; i++) {
    if ((you.gens[i] ?? 0) > 0) maxUnlocked = i + 1;
  }
  return gi <= maxUnlocked;
}

function genTip(gi: number): TipCard | null {
  const you = store.you;
  const g = GENERATORS[gi];
  if (!g || !you) return null;

  if (!isGenRevealed(gi, you)) {
    return {
      title: '???',
      body: t('shop.tip.locked'),
      stats: [{ label: t('shop.tip.buy'), value: `${fmt(g.baseCost)} ${t('unit')}`, warn: true }],
    };
  }

  const owned = you.gens[gi] ?? 0;
  const each = g.baseBps * genMult(gi, you.upgrades);
  const total = each * owned;
  const { qty, cost } = resolveBuyQty(gi, owned, you.bp);
  const afford = you.bp >= cost;
  const qtyLabel = qtySel === -1 ? `×${qty}` : qty > 1 ? `×${qty}` : '×1';

  const stats: TipCard['stats'] = [
    { label: t('shop.tip.base'), value: `${fmt(g.baseBps)} ${t('unit')}/s` },
    { label: t('shop.tip.each'), value: `${fmt(each)} ${t('unit')}/s`, accent: true },
  ];
  if (owned > 0) {
    stats.unshift({ label: t('shop.tip.owned'), value: `×${owned}`, accent: true });
    stats.push({ label: t('shop.tip.total'), value: `${fmt(total)} ${t('unit')}/s`, accent: true });
  }
  stats.push({
    label: `${t('shop.tip.buy')} (${qtyLabel})`,
    value: `${fmt(cost)} ${t('unit')}`,
    accent: afford,
    warn: !afford,
  });

  return {
    title: t(`gen.${g.id}.name`),
    body: t(`gen.${g.id}.flavor`),
    stats,
    footer: afford ? undefined : t('shop.tip.cantAfford'),
    warnFooter: !afford,
  };
}

function refresh(): void {
  const you = store.you;
  if (!you) return;

  GENERATORS.forEach((g, gi) => {
    const row = rows[gi]!;
    const owned = you.gens[gi] ?? 0;
    const revealed = isGenRevealed(gi, you);
    row.root.classList.toggle('locked', !revealed);

    if (!revealed) {
      row.name.textContent = '???';
      row.owned.classList.add('hidden');
      row.rate.textContent = `${fmt(g.baseBps)}/s`;
      row.cost.textContent = fmt(g.baseCost);
      row.root.classList.add('cant');
      return;
    }

    row.name.textContent = t(`gen.${g.id}.name`);
    const { qty, cost } = resolveBuyQty(gi, owned, you.bp);
    const each = g.baseBps * genMult(gi, you.upgrades);
    const afford = you.bp >= cost;

    if (owned > 0) {
      row.owned.textContent = `×${owned}`;
      row.owned.classList.remove('hidden');
    } else {
      row.owned.classList.add('hidden');
    }

    row.rate.textContent = `${fmt(each)}/s`;
    if (owned > 0) row.rate.textContent += ` · ${fmt(each * owned)}/s`;

    row.cost.textContent = fmt(cost);
    if (qtySel === -1 && qty > 1) row.cost.textContent = `×${qty} ${fmt(cost)}`;

    row.root.classList.toggle('afford', afford);
    row.root.classList.toggle('cant', !afford);
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

function upgradeTip(u: UpgradeDef): TipCard {
  const you = store.you;
  const afford = you ? you.bp >= u.cost : false;
  const reqLabel =
    u.kind === 'gen'
      ? `${u.threshold}× ${t(`gen.${GENERATORS[u.gen]!.id}.name`)}`
      : t('upgrade.tip.reqClicks', { n: u.threshold });

  return {
    title: upgradeName(u),
    body: upgradeDesc(u),
    stats: [
      { label: t('upgrade.tip.effect'), value: `×${u.mult}`, accent: true },
      { label: t('upgrade.tip.requirement'), value: reqLabel },
      {
        label: t('upgrade.tip.cost'),
        value: `${fmt(u.cost)} ${t('unit')}`,
        accent: afford,
        warn: !afford,
      },
    ],
    footer: afford ? undefined : t('upgrade.tip.cantAfford'),
    warnFooter: !afford,
  };
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
      b.appendChild(el('span', 'upgrade-cost', fmt(u.cost)));
      bindCursorTip(b, () => upgradeTip(u));
      b.onclick = () => {
        const u = UPGRADE_BY_ID.get(b.dataset.uid ?? '');
        const cur = store.you;
        if (u && cur && cur.bp >= u.cost) store.buyUpgrade(u.id);
      };
      box.appendChild(b);
    }
  }
  for (const b of box.querySelectorAll<HTMLButtonElement>('.upgrade-btn')) {
    const cant = you.bp < Number(b.dataset.cost);
    b.classList.toggle('cant', cant);
    // Never `disabled` — it blocks hover tooltips in most browsers.
  }
}
