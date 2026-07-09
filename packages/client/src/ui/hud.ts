import { fmt, fmtDuration } from '../format';
import { gradeLabel, t } from '../i18n';
import { store } from '../state';
import { el, id } from './dom';

let quizSent = false;

let displayBp = 0;
let lastTargetBp = 0;
let lastGainFx = 0;

export function initHud(): void {
  store.on('event', () => {
    quizSent = false;
    renderEventBanner();
  });
  store.on('you', renderStatic);
  store.on('joined', () => {
    displayBp = store.you?.bp ?? 0;
    lastTargetBp = displayBp;
    renderStatic();
    renderEventBanner();
  });

  id('quiz-submit').addEventListener('click', submitQuiz);
  id<HTMLInputElement>('quiz-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') submitQuiz();
  });

  setInterval(tick, 150);
  requestAnimationFrame(animateBp);
}

/** Brief pulse + floating gain text on the balance panel. */
export function hudGainBurst(amount: number): void {
  if (amount <= 0) return;
  triggerGainVisual(amount, true);
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

  id('bp-unit').textContent = t('unit');

  const pb = id('btn-prestige');
  if (you.starsIfGraduate >= 1) {
    pb.classList.remove('hidden');
    pb.textContent = `${t('prestige.button')} +${you.starsIfGraduate}★`;
  } else {
    pb.classList.add('hidden');
  }
}

function animateBp(): void {
  const you = store.you;
  if (you) {
    const target = you.bp;
    const diff = target - displayBp;

    if (Math.abs(diff) < 0.5) {
      displayBp = target;
    } else {
      const speed = Math.max(0.1, Math.min(0.4, Math.abs(diff) / Math.max(target * 0.02, 50)));
      displayBp += diff * speed;
    }

    id('bp-value').textContent = fmt(displayBp);

    const jump = target - lastTargetBp;
    const passive = you.bps * (1 / 60);
    if (jump > Math.max(passive * 8, 2)) {
      maybeGainFx(jump);
    }
    lastTargetBp = target;
  }

  requestAnimationFrame(animateBp);
}

function maybeGainFx(amount: number): void {
  const now = performance.now();
  if (now - lastGainFx < 250) return;
  triggerGainVisual(amount, false);
}

function triggerGainVisual(amount: number, showFloat: boolean): void {
  lastGainFx = performance.now();

  const panel = id('bp-panel');
  panel.classList.remove('gain');
  void panel.offsetWidth;
  panel.classList.add('gain');

  if (showFloat) {
    const floats = id('bp-floats');
    const node = el('span', 'bp-float');
    node.textContent = `+${fmt(amount)}`;
    floats.appendChild(node);
    setTimeout(() => node.remove(), 1300);
  }
}

function tick(): void {
  const you = store.you;
  if (!you) return;

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
