import './styles.css';
import { fmt } from './format';
import { gradeLabel, t } from './i18n';
import { platform } from './platform';
import { Scene } from './render/scene';
import { brainIcon, gearIcon, iconDataUrl, trophyIcon } from './render/sprites';
import { store } from './state';
import { initBoss } from './ui/boss';
import { initChat } from './ui/chat';
import { el, id } from './ui/dom';
import { initHud } from './ui/hud';
import {
  closeModal,
  joinModal,
  leaderboardModal,
  prestigeModal,
  replacedModal,
  settingsModal,
  toast,
} from './ui/modals';
import { closePopover, showDeskPopover } from './ui/popover';
import { initShop } from './ui/shop';
import { applyStaticTexts } from './ui/texts';

async function boot(): Promise<void> {
  if (platform.enabled) {
    await platform.init();
  }

  applyStaticTexts();
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

  // ----------------------------------------------------------------- Clicking

  function doClick(): void {
    const gain = store.click();
    if (gain > 0) scene.clickFloaterAtOwnDesk(`+${fmt(gain)}`);
  }

  id('btn-click').addEventListener('click', doClick);
  scene.onOwnDeskClick = doClick;
  scene.onDeskClick = (hit) => showDeskPopover(hit);

  document.addEventListener('keydown', (ev) => {
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

  // ---------------------------------------------------------- Store reactions

  let lastGrade = -1;

  store.on('joined', () => {
    closePopover();
    platform.onGameplayStart();
    if (lastGrade === -1) {
      scene.scrollToOwnDesk();
      lastGrade = store.you?.grade ?? 0;
    }
  });

  store.on('you', () => {
    const grade = store.you?.grade ?? 0;
    if (lastGrade >= 0 && grade > lastGrade) {
      toast(t('prestige.done', { g: gradeLabel(grade) }), 'gold');
      if (platform.enabled) void platform.requestMidgameAd();
    }
    if (lastGrade >= 0) lastGrade = Math.max(lastGrade, grade);
  });

  store.on('error', (code) => toast(t(`err.${code}`), 'bad'));

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
      toast(t('steal.caught.you'), 'bad');
    } else if (s.victim === you.id && !s.caught) {
      const attacker = store.roster.get(s.attacker)?.name ?? '?';
      toast(t('steal.hit.you', { a: attacker, v: fmt(s.amount) }), 'bad');
    } else if (s.attacker === you.id && !s.caught) {
      const victim = store.roster.get(s.victim)?.name ?? '?';
      toast(t('steal.success', { v: fmt(s.amount), b: victim }), 'gold');
    }
  });

  store.on('quizResult', (r) => {
    const name = store.you?.name;
    if (name && r.winners.includes(name)) {
      toast(t('event.quiz.win'), 'gold');
    }
  });

  store.on('goalDone', () => toast(t('goal.done'), 'gold'));

  store.on('status', (s) => {
    id('conn-banner').classList.toggle('hidden', s !== 'reconnecting');
    if (s === 'replaced') replacedModal();
  });

  platform.loadingDone();

  // ------------------------------------------------------------------- Join

  if (store.hasAccount) {
    store.connect();
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
  (window as unknown as Record<string, unknown>).__kr = { store, scene, platform };
}

void boot();
