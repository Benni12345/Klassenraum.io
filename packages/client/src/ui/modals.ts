import { AVATAR_RANGES, PRESTIGE_BASE } from '@shared/balance';
import { isCleanUsername } from '@shared/moderation';
import type { AvatarSpec, LeaderboardRow } from '@shared/types';
import {
  isMusicEnabled,
  isSfxEnabled,
  setMusicEnabled,
  setSfxEnabled,
  sfxBuy,
} from '../audio';
import { fmt } from '../format';
import { gradeLabel, t } from '../i18n';
import { syncMusic } from '../music';
import { iconDataUrl, studentSprite } from '../render/sprites';
import { platform } from '../platform';
import { store } from '../state';
import { mountRewardedBoostButton, showPrestigeMidgameAd } from './ads';
import { el, id } from './dom';
import { buildLangSelector } from './langSelector';
import { pushOverlay } from './overlay';
import { toast } from './toast';
import { startTutorial } from './tutorial';

export { toast };

const modalRoot = () => id('modal-root');

interface ModalOpts {
  title: string;
  /** Click-outside / Esc / × close. Non-dismissable modals must offer an action. */
  dismissable?: boolean;
}

/** Close handle for the modal currently on screen (Esc, tab switches). */
let activeClose: (() => void) | null = null;

export function closeTopModal(): boolean {
  if (!activeClose) return false;
  activeClose();
  return true;
}

/**
 * Opens a modal with a sticky header (title + close) and a sticky action bar,
 * so the primary action is always reachable without scrolling the content.
 */
function openModal(
  opts: ModalOpts,
  build: (body: HTMLElement, foot: HTMLElement, close: () => void) => void,
): () => void {
  const root = modalRoot();
  root.innerHTML = '';
  const dismissable = opts.dismissable !== false;
  const wasPlaying = store.you !== null && store.status === 'open';
  if (wasPlaying) platform.onGameplayStop();
  const releaseOverlay = pushOverlay();

  const box = el('div', 'modal');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (activeClose === close) activeClose = null;
    root.innerHTML = '';
    root.onclick = null;
    releaseOverlay();
    if (wasPlaying) platform.onGameplayStart();
  };
  activeClose = dismissable ? close : null;

  const head = el('div', 'modal-head');
  head.appendChild(el('h2', '', opts.title));
  if (dismissable) {
    const x = el('button', 'modal-close', '×');
    x.type = 'button';
    x.title = t('ui.close');
    x.setAttribute('aria-label', t('ui.close'));
    x.onclick = close;
    head.appendChild(x);
  }
  const body = el('div', 'modal-body');
  const foot = el('div', 'modal-foot');

  box.appendChild(head);
  box.appendChild(body);
  box.appendChild(foot);

  if (dismissable) {
    root.onclick = (ev) => {
      if (ev.target === root) close();
    };
  } else {
    root.onclick = null;
  }

  build(body, foot, close);
  root.appendChild(box);
  return close;
}

export function closeModal(): void {
  closeTopModal();
  modalRoot().innerHTML = '';
}

// ------------------------------------------------------------------- Avatars

function randomAvatar(): AvatarSpec {
  return {
    skin: Math.floor(Math.random() * AVATAR_RANGES.skin),
    hair: Math.floor(Math.random() * AVATAR_RANGES.hair),
    hairColor: Math.floor(Math.random() * AVATAR_RANGES.hairColor),
    shirt: Math.floor(Math.random() * AVATAR_RANGES.shirt),
  };
}

/** Avatar picker with live preview; returns a re-label hook for language swaps. */
function buildAvatarPicker(
  avatar: AvatarSpec,
  onChange?: (a: AvatarSpec) => void,
): { root: HTMLElement; relabel: () => void } {
  const picker = el('div', 'avatar-picker');
  const preview = el('div', 'avatar-preview');
  const img = el('img');
  img.alt = '';
  preview.appendChild(img);
  picker.appendChild(preview);

  const rows = el('div', 'picker-rows');
  const labels: Array<[HTMLElement, () => string]> = [];
  const refresh = () => {
    img.src = iconDataUrl(studentSprite(avatar), 8);
  };
  const fields: Array<[keyof AvatarSpec, () => string, number]> = [
    ['skin', () => t('join.skin'), AVATAR_RANGES.skin],
    ['hair', () => t('join.hair'), AVATAR_RANGES.hair],
    ['hairColor', () => t('join.hairColor'), AVATAR_RANGES.hairColor],
    ['shirt', () => t('join.shirt'), AVATAR_RANGES.shirt],
  ];
  for (const [key, label, max] of fields) {
    const row = el('div', 'picker-row');
    const span = el('span', '', label());
    row.appendChild(span);
    labels.push([span, label]);
    const step = (delta: number) => {
      avatar[key] = (avatar[key] + max + delta) % max;
      refresh();
      onChange?.(avatar);
    };
    const prev = el('button', '', '<');
    prev.type = 'button';
    prev.onclick = () => step(-1);
    const next = el('button', '', '>');
    next.type = 'button';
    next.onclick = () => step(1);
    row.appendChild(prev);
    row.appendChild(next);
    rows.appendChild(row);
  }
  picker.appendChild(rows);
  refresh();

  return {
    root: picker,
    relabel: () => {
      for (const [node, label] of labels) node.textContent = label();
    },
  };
}

// ---------------------------------------------------------------- Join flow

/**
 * Name + avatar entry for self-hosted builds. On CrazyGames the player drops
 * straight into the classroom instead: the CrazyGames username is used and no
 * onboarding screen sits between the click and gameplay.
 */
export function joinModal(onDone: (name: string, avatar: AvatarSpec) => void): void {
  const avatar = randomAvatar();

  openModal({ title: t('join.title'), dismissable: false }, (body, foot) => {
    const sub = el('p', '', t('join.sub'));
    body.appendChild(sub);

    const picker = buildAvatarPicker(avatar);
    body.appendChild(
      buildLangSelector({
        onChange: () => {
          sub.textContent = t('join.sub');
          picker.relabel();
          nameInput.placeholder = t('join.name');
          start.textContent = t('join.start');
        },
      }),
    );
    body.appendChild(picker.root);

    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.maxLength = 20;
    nameInput.placeholder = t('join.name');
    const nameRow = el('div', 'row');
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    const start = el('button', 'btn gold', t('join.start'));
    start.type = 'button';
    start.onclick = () => {
      const name = nameInput.value.trim();
      if (name && !isCleanUsername(name)) {
        toast(t('err.nameBlocked'), 'bad');
        return;
      }
      onDone(name, avatar);
    };
    foot.appendChild(start);
    setTimeout(() => nameInput.focus(), 50);
  });
}

// ----------------------------------------------------------------- Prestige

/**
 * Graduation confirmation. CrazyGames allows a midgame ad on prestige only
 * after an explicit warning that progress resets, so the ad is requested from
 * the "Yes" branch and nowhere else.
 */
export function prestigeModal(): void {
  const you = store.you;
  if (!you) return;
  const eligible = you.starsIfGraduate >= 1;

  openModal({ title: t('prestige.title') }, (body, foot, close) => {
    if (!eligible) {
      const missing = Math.max(0, PRESTIGE_BASE - you.runBp);
      body.appendChild(el('p', '', t('prestige.locked', { v: fmt(missing) })));
      const ok = el('button', 'btn', t('ui.close'));
      ok.type = 'button';
      ok.onclick = close;
      foot.appendChild(ok);
      return;
    }

    body.appendChild(el('p', '', t('prestige.desc', { n: you.starsIfGraduate })));
    body.appendChild(el('p', 'modal-warn', t('prestige.warn')));
    const row = el('div', 'row');
    row.appendChild(el('span', '', `${gradeLabel(you.grade)} > ${gradeLabel(you.grade + 1)}`));
    body.appendChild(row);

    const no = el('button', 'btn', t('prestige.no'));
    no.type = 'button';
    no.onclick = close;
    const yes = el('button', 'btn gold', `${t('prestige.yes')} +${you.starsIfGraduate}★`);
    yes.type = 'button';
    yes.onclick = () => {
      store.prestige();
      close();
      showPrestigeMidgameAd();
    };
    foot.appendChild(no);
    foot.appendChild(yes);
  });
}

// -------------------------------------------------------------- Leaderboard

let lbTbody: HTMLElement | null = null;

export function leaderboardModal(): void {
  store.requestLeaderboard();
  openModal({ title: t('leaderboard.title') }, (body, foot, close) => {
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
    body.appendChild(table);

    const ok = el('button', 'btn', t('ui.close'));
    ok.type = 'button';
    ok.onclick = close;
    foot.appendChild(ok);
  });
}

store.on('leaderboard', (rows: LeaderboardRow[]) => {
  if (!lbTbody || !lbTbody.isConnected) return;
  lbTbody.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', '', String(i + 1)));
    const nameTd = el('td', 'lb-name');
    if (r.online) nameTd.appendChild(el('span', 'dot'));
    nameTd.appendChild(el('span', '', `${r.name} (${gradeLabel(r.grade)})`));
    tr.appendChild(nameTd);
    tr.appendChild(el('td', 'num', String(r.stars)));
    tr.appendChild(el('td', 'num', fmt(r.lifetimeBp)));
    lbTbody!.appendChild(tr);
  });
});

// -------------------------------------------------------------- How to play

const HOWTO_SECTIONS = ['notes', 'shop', 'upgrades', 'steal', 'events', 'prestige', 'boss'];

export function howToPlayModal(): void {
  openModal({ title: t('howto.title') }, (body, foot, close) => {
    for (const key of HOWTO_SECTIONS) {
      body.appendChild(el('h3', 'howto-h', t(`howto.${key}.h`)));
      body.appendChild(el('p', '', t(`howto.${key}.p`)));
    }
    const ok = el('button', 'btn gold', t('ui.close'));
    ok.type = 'button';
    ok.onclick = close;
    foot.appendChild(ok);
  });
}

// ----------------------------------------------------------------- Settings

function buildToggle(label: string, get: () => boolean, set: (on: boolean) => void): HTMLElement {
  const row = el('div', 'row toggle-row');
  row.appendChild(el('span', '', label));
  const btn = el('button', 'btn small toggle');
  btn.type = 'button';
  const paint = () => {
    const on = get();
    btn.textContent = on ? t('settings.on') : t('settings.off');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  btn.onclick = () => {
    set(!get());
    paint();
  };
  paint();
  row.appendChild(btn);
  return row;
}

export function settingsModal(): void {
  const you = store.you;
  openModal({ title: t('settings.title') }, (body, foot, close) => {
    body.appendChild(
      buildLangSelector({
        label: true,
        onChange: () => {
          close();
          settingsModal();
        },
      }),
    );

    // ---- Player name: CrazyGames usernames are used as-is and not editable.
    if (you) {
      body.appendChild(el('h3', 'settings-h', t('settings.name')));
      if (you.cgLinked) {
        const row = el('div', 'row');
        row.appendChild(el('span', 'name-readonly', you.name));
        body.appendChild(row);
        body.appendChild(el('p', 'settings-note', t('settings.nameCg')));
      } else if (platform.enabled) {
        const row = el('div', 'row');
        row.appendChild(el('span', 'name-readonly', you.name));
        body.appendChild(row);
        body.appendChild(el('p', 'settings-note', t('settings.nameGuest')));
      } else {
        const renameRow = el('div', 'row');
        const input = el('input');
        input.type = 'text';
        input.maxLength = 20;
        input.value = you.name;
        input.style.flex = '1';
        input.style.width = 'auto';
        const save = el('button', 'btn small', t('settings.renameSave'));
        save.type = 'button';
        save.onclick = () => {
          const next = input.value.trim();
          if (!next || next === you.name) return;
          if (!isCleanUsername(next)) {
            toast(t('err.nameBlocked'), 'bad');
            return;
          }
          store.rename(next);
        };
        renameRow.appendChild(input);
        renameRow.appendChild(save);
        body.appendChild(renameRow);
      }

      const avatar: AvatarSpec = { ...you.avatar };
      const picker = buildAvatarPicker(avatar, (a) => store.setAvatar(a));
      body.appendChild(picker.root);
    }

    // ---- Audio
    body.appendChild(el('h3', 'settings-h', t('settings.audio')));
    body.appendChild(
      buildToggle(t('settings.music'), isMusicEnabled, (on) => {
        setMusicEnabled(on);
        syncMusic();
      }),
    );
    body.appendChild(
      buildToggle(t('settings.sfx'), isSfxEnabled, (on) => {
        setSfxEnabled(on);
        if (on) sfxBuy();
      }),
    );

    // ---- Help
    const helpRow = el('div', 'row');
    const howto = el('button', 'btn small', t('settings.howto'));
    howto.type = 'button';
    howto.onclick = () => {
      close();
      howToPlayModal();
    };
    const replay = el('button', 'btn small', t('settings.tutorial'));
    replay.type = 'button';
    replay.onclick = () => {
      close();
      startTutorial({ force: true });
    };
    helpRow.appendChild(howto);
    helpRow.appendChild(replay);
    body.appendChild(helpRow);
    body.appendChild(el('p', 'settings-note', t('settings.boss')));

    // ---- Stats
    if (you) {
      body.appendChild(el('h3', 'settings-h', t('settings.stats')));
      const stats = el('p');
      stats.appendChild(el('span', '', t('settings.stolen', { v: fmt(you.stolenTotal) })));
      stats.appendChild(el('br'));
      stats.appendChild(el('span', '', t('settings.lost', { v: fmt(you.lostTotal) })));
      stats.appendChild(el('br'));
      stats.appendChild(el('span', '', t('settings.clicks', { v: you.clicks })));
      body.appendChild(stats);
    }

    // ---- Rewarded ad + optional CrazyGames login (never a main CTA)
    let stopAd: (() => void) | null = null;
    if (platform.enabled) {
      const adHost = el('div', 'settings-ad-host');
      body.appendChild(adHost);
      stopAd = mountRewardedBoostButton(adHost, { compact: true });

      void platform.getUser().then((u) => {
        if (u || !body.isConnected) return;
        const loginRow = el('div', 'row ad-reward-row');
        const loginBtn = el('button', 'btn small', t('settings.cgLogin'));
        loginBtn.type = 'button';
        loginBtn.title = t('settings.cgLoginHint');
        loginBtn.onclick = async () => {
          const user = await platform.showAuthPrompt();
          if (user) {
            stopAd?.();
            close();
            location.reload();
          }
        };
        loginRow.appendChild(loginBtn);
        body.appendChild(loginRow);
      });
    }

    const ok = el('button', 'btn gold', t('ui.close'));
    ok.type = 'button';
    ok.onclick = () => {
      stopAd?.();
      close();
    };
    foot.appendChild(ok);
  });
}

// ------------------------------------------------------- Connection replace

export function replacedModal(): void {
  openModal({ title: t('game.title'), dismissable: false }, (body, foot) => {
    body.appendChild(el('p', '', t('conn.replaced')));
    const b = el('button', 'btn gold', t('conn.playHere'));
    b.type = 'button';
    b.onclick = () => {
      closeModal();
      store.connect();
    };
    foot.appendChild(b);
  });
}
