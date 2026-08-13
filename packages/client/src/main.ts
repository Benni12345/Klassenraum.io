import './styles.css';
import {
  isEffectivelyMuted,
  isPlatformMuted,
  setPlatformMuted,
  sfxClick,
  sfxError,
  sfxSteal,
  sfxSuccess,
  unlockAudio,
} from './audio';
import { fmt } from './format';
import { gradeLabel, t } from './i18n';
import { initMusic, syncMusic } from './music';
import { platform } from './platform';
import { CG_TUTORIAL_KEY, isTutorialDoneLocally, rememberTutorialDoneLocally } from './prefs';
import { Scene } from './render/scene';
import { brainIcon, gearIcon, iconDataUrl, trophyIcon } from './render/sprites';
import { store } from './state';
import { initBoss } from './ui/boss';
import { initChat } from './ui/chat';
import { el, id } from './ui/dom';
import { initHud } from './ui/hud';
import { initMobileTabs } from './ui/mobile';
import {
  closeModal,
  closeTopModal,
  howToPlayModal,
  infoPageModal,
  joinModal,
  leaderboardModal,
  prestigeModal,
  replacedModal,
  settingsModal,
  toast,
} from './ui/modals';
import { closePopover, showDeskPopover } from './ui/popover';
import { initLangSelector } from './ui/langSelector';
import { initShop } from './ui/shop';
import { applyStaticTexts } from './ui/texts';
import { initHints, startTutorial } from './ui/tutorial';

async function boot(): Promise<void> {
  let initialAuth: Awaited<ReturnType<typeof platform.getAuth>> | null = null;
  if (platform.enabled) {
    await platform.init();
    // Resolve login + JWT *before* opening the socket. A hello sent while the
    // SDK still has no token seats a blank guest save for a logged-in player.
    initialAuth = await platform.getAuth();
    store.setCgAuthProvider(() => platform.getAuth());
    // CrazyGames Data is cloud-synced per account. Merge it into local prefs
    // before hello so Skip follows the player across browsers / incognito.
    // sessionStorage covers the same-tab auth reload when CG restores empty
    // account localStorage over the guest prefs.
    const remote = platform.getDataItem(CG_TUTORIAL_KEY);
    if (remote === '1' || remote === 'true' || isTutorialDoneLocally()) {
      rememberTutorialDoneLocally();
      if (remote !== '1' && remote !== 'true') platform.setDataItem(CG_TUTORIAL_KEY, '1');
    }
  }

  // Unlock Web Audio on the first user gesture (autoplay policies), then start
  // the background music loop.
  const unlockOnce = () => {
    unlockAudio();
    initMusic();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });
  platform.onSettingsChange(() => syncMusic());

  applyStaticTexts();
  initLangSelector('lang-selector');
  initMobileTabs();
  initBoss();

  // Pixel icons for the DOM chrome.
  id<HTMLImageElement>('hud-brain').src = iconDataUrl(brainIcon, 6);
  const lbImg = el('img');
  lbImg.src = iconDataUrl(trophyIcon, 4);
  id('btn-leaderboard').appendChild(lbImg);
  const setImg = el('img');
  setImg.src = iconDataUrl(gearIcon, 4);
  id('btn-settings').appendChild(setImg);

  const scene = new Scene(id<HTMLCanvasElement>('scene'));
  initHud();
  initShop();
  initChat();
  initHints();

  // ----------------------------------------------------------------- Clicking

  function doClick(): void {
    const gain = store.click();
    if (gain > 0) {
      sfxClick();
      scene.clickFloaterAtOwnDesk(`+${fmt(gain)}`);
    }
  }

  id('btn-click').addEventListener('click', doClick);
  scene.onOwnDeskClick = doClick;
  scene.onDeskClick = (hit) => showDeskPopover(hit);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      // Esc closes in-game overlays; the boss key is Tab so Esc stays free for
      // the browser's own "leave fullscreen" shortcut.
      if (closeTopModal()) ev.preventDefault();
      closePopover();
      return;
    }
    if (ev.code !== 'Space') return;
    const target = ev.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    ev.preventDefault();
    doClick();
  });

  // ------------------------------------------------------------------ Buttons

  id('btn-my-desk').addEventListener('click', () => scene.scrollToOwnDesk());
  id('btn-prestige').addEventListener('click', () => prestigeModal());
  id('btn-leaderboard').addEventListener('click', () => leaderboardModal());
  id('btn-settings').addEventListener('click', () => settingsModal());
  id('btn-howto').addEventListener('click', () => howToPlayModal());
  id('footer-guide').addEventListener('click', (ev) => {
    ev.preventDefault();
    howToPlayModal();
  });
  id('footer-about').addEventListener('click', (ev) => {
    ev.preventDefault();
    infoPageModal(t('footer.about'), './about.html');
  });
  id('footer-privacy').addEventListener('click', (ev) => {
    ev.preventDefault();
    infoPageModal(t('footer.privacy'), './privacy.html');
  });
  id('footer-impressum').addEventListener('click', (ev) => {
    ev.preventDefault();
    infoPageModal(t('footer.impressum'), './impressum.html');
  });

  // ------------------------------------------------------------- Multiplayer

  if (platform.enabled) {
    const invite = id('btn-invite');
    const link = platform.inviteLink();
    if (link) {
      invite.classList.remove('hidden');
      invite.addEventListener('click', () => {
        const href = platform.inviteLink();
        if (!href) return;
        void navigator.clipboard
          ?.writeText(href)
          .then(() => toast(t('invite.copied'), 'gold'))
          .catch(() => {});
      });
    }
    // Friends joining from the CrazyGames UI land in the same shared classroom,
    // so no reload or lobby hop is needed — just make sure we're connected.
    platform.onJoinRoom(() => {
      closeModal();
      if (!store.you) store.connect();
      platform.markRoomJoinable();
    });
  }

  // ---------------------------------------------------------- Store reactions

  let lastGrade = -1;

  store.on('joined', () => {
    closePopover();
    platform.markRoomJoinable();
    platform.showInviteButton();
    // Last-resort: if we seated a guest save while CrazyGames says the player
    // is logged in, reload once so hello can include the JWT. The net layer
    // already refuses a guest welcome after a JWT hello; this covers the case
    // where the first hello went out before login was visible.
    if (platform.enabled && store.you && !store.you.cgLinked) {
      void platform.getAuth().then((auth) => {
        if (!auth.loggedIn) {
          try {
            sessionStorage.removeItem('kr_cg_rejoin');
          } catch {
            /* private mode */
          }
          return;
        }
        try {
          if (sessionStorage.getItem('kr_cg_rejoin') === '1') return;
          sessionStorage.setItem('kr_cg_rejoin', '1');
        } catch {
          return;
        }
        location.reload();
      });
    } else {
      try {
        sessionStorage.removeItem('kr_cg_rejoin');
      } catch {
        /* private mode */
      }
    }
    if (lastGrade === -1) {
      scene.scrollToOwnDesk();
      lastGrade = store.you?.grade ?? 0;
      // Tutorial completion is one-way across server save, local prefs, and
      // CrazyGames Data. Heal any lagging store so Skip survives new browsers.
      const serverDone = store.you?.tutorialDone === true;
      const localDone = isTutorialDoneLocally();
      if (serverDone || localDone) rememberTutorialDoneLocally();
      if (!serverDone && localDone) store.markTutorialDone();
      if ((serverDone || localDone) && platform.enabled) {
        platform.setDataItem(CG_TUTORIAL_KEY, '1');
      }
      // First-time gameplayStart waits until the tutorial is finished or skipped.
      // Instant multiplayer / returning players start immediately.
      const showTutorial =
        !platform.isInstantMultiplayer && !(store.you?.tutorialDone || isTutorialDoneLocally());
      if (showTutorial) {
        startTutorial();
      } else {
        platform.onGameplayStart();
      }
    } else {
      // Reconnect / reseat — gameplay was already running.
      platform.onGameplayStart();
    }
  });

  store.on('you', () => {
    const grade = store.you?.grade ?? 0;
    if (lastGrade >= 0 && grade > lastGrade) {
      sfxSuccess();
      toast(t('prestige.done', { g: gradeLabel(grade) }), 'gold');
      platform.happytime();
    }
    if (lastGrade >= 0) lastGrade = Math.max(lastGrade, grade);
  });

  store.on('error', (code) => {
    sfxError();
    toast(t(`err.${code}`), 'bad');
  });

  store.on('offline', (o) => {
    const hours = Math.floor(o.ms / 3_600_000);
    const mins = Math.floor((o.ms % 3_600_000) / 60_000);
    const dur = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    toast(t('offline.toast', { v: fmt(o.bp), t: dur }), 'gold');
  });

  store.on('steal', (s) => {
    const you = store.you;
    if (!you) return;
    if (s.caught && s.attacker === you.id) {
      sfxError();
      toast(t('steal.caught.you'), 'bad');
    } else if (s.victim === you.id && !s.caught) {
      sfxSteal();
      const attacker = store.roster.get(s.attacker)?.name ?? '?';
      toast(t('steal.hit.you', { a: attacker, v: fmt(s.amount) }), 'bad');
    } else if (s.attacker === you.id && !s.caught) {
      sfxSteal();
      const victim = store.roster.get(s.victim)?.name ?? '?';
      toast(t('steal.success', { v: fmt(s.amount), b: victim }), 'gold');
    }
  });

  store.on('quizResult', (r) => {
    const name = store.you?.name;
    if (name && r.winners.includes(name)) {
      sfxSuccess();
      toast(t('event.quiz.win'), 'gold');
    }
  });

  store.on('goalDone', () => {
    sfxSuccess();
    toast(t('goal.done'), 'gold');
  });

  store.on('status', (s) => {
    id('conn-banner').classList.toggle('hidden', s !== 'reconnecting');
    if (s === 'replaced') replacedModal();
  });

  // Any CrazyGames auth change swaps the active save (account <-> guest), so the
  // page reloads and the hello handshake resolves the right one.
  if (platform.enabled) {
    let knownUser: string | null = initialAuth?.username ?? null;
    platform.onAuthChange((user) => {
      const next = user?.username ?? null;
      if (next === knownUser) return;
      knownUser = next;
      // Stash Skip before CG reloads / restores account storage over guest data.
      if (store.you?.tutorialDone || isTutorialDoneLocally()) {
        rememberTutorialDoneLocally();
        platform.setDataItem(CG_TUTORIAL_KEY, '1');
        store.markTutorialDone();
      }
      location.reload();
    });
  }

  platform.loadingDone();

  // ------------------------------------------------------------------- Join

  // CrazyGames: no name prompt and no onboarding gate. Logged-in players get
  // their CrazyGames username, guests a stylized Student_#### name, and the
  // player is joinable immediately (also required for instant multiplayer).
  if (store.hasAccount || platform.enabled) {
    store.connect(initialAuth?.token ? { cgToken: initialAuth.token } : undefined);
  } else {
    platform.onGameplayStop();
    joinModal((name, avatar) => {
      closeModal();
      store.connect({ name: name || undefined, avatar });
    });
  }

  // Keepalive + server clock sync.
  setInterval(() => store.ping(), 25_000);

  // Debug handle for integration tests and console tinkering.
  (window as unknown as Record<string, unknown>).__kr = {
    store,
    scene,
    platform,
    audio: { setPlatformMuted, isPlatformMuted, isEffectivelyMuted },
  };
}

void boot();
