import { AVATAR_RANGES, PRESTIGE_BASE } from '@shared/balance';
import type { AvatarSpec, LeaderboardRow } from '@shared/types';
import { fmt } from '../format';
import { getLocale, gradeLabel, setLocale, t } from '../i18n';
import { iconDataUrl, studentSprite } from '../render/sprites';
import { store } from '../state';
import { el, id } from './dom';
import { applyStaticTexts } from './texts';

const modalRoot = () => id('modal-root');
const toastRoot = () => id('toast-root');

// ------------------------------------------------------------------- Toasts

export function toast(text: string, kind: 'info' | 'gold' | 'bad' = 'info'): void {
  const box = el('div', `toast ${kind === 'info' ? '' : kind}`, text);
  toastRoot().appendChild(box);
  while (toastRoot().children.length > 4) toastRoot().firstChild?.remove();
  setTimeout(() => box.remove(), 4200);
}

// ------------------------------------------------------------------- Modals

function openModal(
  build: (box: HTMLElement, close: () => void) => void,
  dismissable = true,
): () => void {
  const root = modalRoot();
  root.innerHTML = '';
  const box = el('div', 'modal');
  const close = () => {
    if (box.parentElement) root.innerHTML = '';
  };
  if (dismissable) {
    root.onclick = (ev) => {
      if (ev.target === root) close();
    };
  } else {
    root.onclick = null;
  }
  build(box, close);
  root.appendChild(box);
  return close;
}

// ---------------------------------------------------------------- Join flow

export function joinModal(onDone: (name: string, avatar: AvatarSpec) => void): void {
  const avatar: AvatarSpec = {
    skin: Math.floor(Math.random() * AVATAR_RANGES.skin),
    hair: Math.floor(Math.random() * AVATAR_RANGES.hair),
    hairColor: Math.floor(Math.random() * AVATAR_RANGES.hairColor),
    shirt: Math.floor(Math.random() * AVATAR_RANGES.shirt),
  };

  openModal((box) => {
    box.appendChild(el('h2', '', t('join.title')));
    const sub = el('p', '', t('join.sub'));
    box.appendChild(sub);

    const picker = el('div', 'avatar-picker');
    const preview = el('div', 'avatar-preview');
    const img = el('img');
    img.alt = '';
    preview.appendChild(img);
    picker.appendChild(preview);

    const rows = el('div', 'picker-rows');
    const refresh = () => {
      img.src = iconDataUrl(studentSprite(avatar), 8);
    };
    const fields: Array<[keyof AvatarSpec, string, number]> = [
      ['skin', t('join.skin'), AVATAR_RANGES.skin],
      ['hair', t('join.hair'), AVATAR_RANGES.hair],
      ['hairColor', t('join.hairColor'), AVATAR_RANGES.hairColor],
      ['shirt', t('join.shirt'), AVATAR_RANGES.shirt],
    ];
    for (const [key, label, max] of fields) {
      const row = el('div', 'picker-row');
      row.appendChild(el('span', '', label));
      const prev = el('button', '', '<');
      const next = el('button', '', '>');
      prev.onclick = () => {
        avatar[key] = (avatar[key] + max - 1) % max;
        refresh();
      };
      next.onclick = () => {
        avatar[key] = (avatar[key] + 1) % max;
        refresh();
      };
      row.appendChild(prev);
      row.appendChild(next);
      rows.appendChild(row);
    }
    picker.appendChild(rows);
    box.appendChild(picker);
    refresh();

    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.maxLength = 16;
    nameInput.placeholder = t('join.name');
    const nameRow = el('div', 'row');
    nameRow.appendChild(nameInput);
    box.appendChild(nameRow);

    const actions = el('div', 'actions');
    const start = el('button', 'btn gold', t('join.start'));
    start.onclick = () => onDone(nameInput.value.trim(), avatar);
    actions.appendChild(start);
    box.appendChild(actions);
    setTimeout(() => nameInput.focus(), 50);
  }, false);
}

export function closeModal(): void {
  modalRoot().innerHTML = '';
}

// ----------------------------------------------------------------- Prestige

export function prestigeModal(): void {
  const you = store.you;
  if (!you) return;
  openModal((box, close) => {
    box.appendChild(el('h2', '', t('prestige.title')));
    if (you.starsIfGraduate >= 1) {
      box.appendChild(el('p', '', t('prestige.desc', { n: you.starsIfGraduate })));
      const row = el('div', 'row');
      row.appendChild(el('span', '', `${gradeLabel(you.grade)} > ${gradeLabel(you.grade + 1)}`));
      box.appendChild(row);
      const actions = el('div', 'actions');
      const cancel = el('button', 'btn', t('prestige.cancel'));
      cancel.onclick = close;
      const ok = el('button', 'btn gold', `${t('prestige.confirm')} +${you.starsIfGraduate}`);
      ok.onclick = () => {
        store.prestige();
        close();
      };
      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(actions);
    } else {
      const missing = PRESTIGE_BASE - you.runBp;
      box.appendChild(el('p', '', t('prestige.locked', { v: fmt(Math.max(0, missing)) })));
      const actions = el('div', 'actions');
      const ok = el('button', 'btn', t('prestige.cancel'));
      ok.onclick = close;
      actions.appendChild(ok);
      box.appendChild(actions);
    }
  });
}

// -------------------------------------------------------------- Leaderboard

let lbTbody: HTMLElement | null = null;

export function leaderboardModal(): void {
  store.requestLeaderboard();
  openModal((box) => {
    box.appendChild(el('h2', '', t('leaderboard.title')));
    const table = el('table', 'lb-table');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', '', '#'));
    hr.appendChild(el('th', '', ''));
    hr.appendChild(el('th', '', t('misc.stars')));
    hr.appendChild(el('th', '', t('leaderboard.lifetime')));
    thead.appendChild(hr);
    table.appendChild(thead);
    lbTbody = el('tbody');
    table.appendChild(lbTbody);
    box.appendChild(table);
  });
}

store.on('leaderboard', (rows: LeaderboardRow[]) => {
  if (!lbTbody || !lbTbody.isConnected) return;
  lbTbody.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', '', String(i + 1)));
    const nameTd = el('td');
    if (r.online) nameTd.appendChild(el('span', 'dot'));
    nameTd.appendChild(el('span', '', `${r.name} (${gradeLabel(r.grade)})`));
    tr.appendChild(nameTd);
    tr.appendChild(el('td', 'num', String(r.stars)));
    tr.appendChild(el('td', 'num', fmt(r.lifetimeBp)));
    lbTbody!.appendChild(tr);
  });
});

// ----------------------------------------------------------------- Settings

export function settingsModal(): void {
  const you = store.you;
  openModal((box, close) => {
    box.appendChild(el('h2', '', t('settings.title')));

    const langRow = el('div', 'row');
    langRow.appendChild(el('span', '', t('settings.lang') + ':'));
    for (const l of ['de', 'en'] as const) {
      const b = el('button', `btn small ${getLocale() === l ? 'gold' : ''}`, l.toUpperCase());
      b.onclick = () => {
        setLocale(l);
        applyStaticTexts();
        close();
        settingsModal();
      };
      langRow.appendChild(b);
    }
    box.appendChild(langRow);

    if (you) {
      const renameRow = el('div', 'row');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 16;
      input.value = you.name;
      input.style.flex = '1';
      input.style.width = 'auto';
      const save = el('button', 'btn small', t('settings.renameSave'));
      save.onclick = () => {
        if (input.value.trim() && input.value.trim() !== you.name) {
          store.rename(input.value.trim());
        }
      };
      renameRow.appendChild(el('span', '', t('settings.rename') + ':'));
      renameRow.appendChild(input);
      renameRow.appendChild(save);
      box.appendChild(renameRow);

      box.appendChild(el('h2', '', t('settings.stats')));
      const stats = el('p');
      stats.innerHTML = '';
      stats.appendChild(el('span', '', t('settings.stolen', { v: fmt(you.stolenTotal) })));
      stats.appendChild(el('br'));
      stats.appendChild(el('span', '', t('settings.lost', { v: fmt(you.lostTotal) })));
      stats.appendChild(el('br'));
      stats.appendChild(el('span', '', t('settings.clicks', { v: you.clicks })));
      box.appendChild(stats);
    }

    box.appendChild(el('p', '', t('settings.boss')));

    const actions = el('div', 'actions');
    const ok = el('button', 'btn', 'OK');
    ok.onclick = close;
    actions.appendChild(ok);
    box.appendChild(actions);
  });
}

// ------------------------------------------------------- Connection replace

export function replacedModal(): void {
  openModal((box) => {
    box.appendChild(el('h2', '', t('game.title')));
    box.appendChild(el('p', '', t('conn.replaced')));
    const actions = el('div', 'actions');
    const b = el('button', 'btn gold', t('conn.playHere'));
    b.onclick = () => {
      closeModal();
      store.connect();
    };
    actions.appendChild(b);
    box.appendChild(actions);
  }, false);
}
