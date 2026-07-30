import { fmt, fmtDuration } from '../format';
import { gradeLabel, t } from '../i18n';
import { store } from '../state';
import { el, id } from './dom';

let quizSent = false;

export function initHud(): void {
  store.on('event', () => {
    quizSent = false;
    renderEventBanner();
  });
  store.on('you', renderStatic);
  store.on('joined', () => {
    renderStatic();
    renderEventBanner();
  });

  id('quiz-submit').addEventListener('click', submitQuiz);
  id<HTMLInputElement>('quiz-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') submitQuiz();
  });

  setInterval(tick, 150);
}

function submitQuiz(): void {
  const input = id<HTMLInputElement>('quiz-input');
  const v = parseFloat(input.value);
  if (!Number.isFinite(v) || quizSent) return;
  store.answerQuiz(v);
  quizSent = true;
  input.value = '';
  renderEventBanner();
}

function renderStatic(): void {
  const you = store.you;
  if (!you) return;
  const badge = id('grade-badge');
  badge.textContent = `${gradeLabel(you.grade)} ★${you.stars}`;
  badge.title = `${t('misc.stars')}: ${you.stars} (+${you.stars * 10}%)`;

  // Player name: the CrazyGames username for logged-in players, otherwise the
  // stylized guest name. Shown in full up to NAME_MAX so it isn't truncated.
  const chip = id('player-chip');
  const name = id('player-name');
  chip.classList.remove('hidden');
  chip.title = you.name;
  if (name.textContent !== you.name) name.textContent = you.name;

  // Always visible so the graduation flow is discoverable (and QA-verifiable).
  const pb = id('btn-prestige');
  pb.classList.remove('hidden');
  const eligible = you.starsIfGraduate >= 1;
  pb.classList.toggle('gold', eligible);
  pb.classList.toggle('ready', eligible);
  pb.textContent = eligible
    ? `${t('prestige.button')} +${you.starsIfGraduate}★`
    : t('prestige.button');
}

function tick(): void {
  const you = store.you;
  if (!you) return;

  id('bp-value').textContent = `${fmt(you.bp)} ${t('unit')}`;
  id('bps-value').textContent = `${t('hud.perSec', { v: fmt(you.bps) })} · ${t('hud.click', {
    v: fmt(you.clickPower),
  })}`;

  renderBuffs();
  updateEventCountdown();
}

function renderBuffs(): void {
  const you = store.you;
  const box = id('buffs');
  if (!you) {
    box.innerHTML = '';
    return;
  }
  const sn = store.serverNow();
  const parts: Array<{ label: string; bad: boolean }> = [];
  for (const b of you.buffs) {
    if (b.until > sn) {
      parts.push({ label: `${t(b.labelKey)} ${fmtDuration(b.until - sn)}`, bad: false });
    }
  }
  if (you.detentionUntil > sn) {
    parts.push({ label: `${t('buff.detention')} ${fmtDuration(you.detentionUntil - sn)}`, bad: true });
  }
  const sig = parts.map((p) => p.label).join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  for (const p of parts) {
    box.appendChild(el('span', `buff${p.bad ? ' bad' : ''}`, p.label));
  }
}

function renderEventBanner(): void {
  const banner = id('event-banner');
  const ev = store.event;
  if (!ev) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.classList.toggle('danger', ev.kind === 'patrol');
  const quizControls = id('quiz-controls');
  if (ev.kind === 'quiz' && !quizSent) {
    quizControls.classList.remove('hidden');
    // Don't steal focus from the chat input.
    if (!(document.activeElement instanceof HTMLInputElement)) {
      setTimeout(() => id<HTMLInputElement>('quiz-input').focus(), 30);
    }
  } else {
    quizControls.classList.add('hidden');
  }
  updateEventCountdown();
}

function updateEventCountdown(): void {
  const ev = store.event;
  if (!ev) return;
  const secs = Math.max(0, Math.ceil((ev.endsAt - store.serverNow()) / 1000));
  let text: string;
  if (ev.kind === 'quiz') {
    text = quizSent
      ? `${t('event.quiz.title')} ${t('event.quiz.sent')} (${secs}s)`
      : `${t('event.quiz.title')} ${ev.question ?? ''} (${secs}s)`;
  } else if (ev.kind === 'patrol') {
    text = `${t('event.patrol.banner')} (${secs}s)`;
  } else {
    text = `${t('event.sub.banner')} (${secs}s)`;
  }
  const node = id('event-text');
  if (node.textContent !== text) node.textContent = text;
}
