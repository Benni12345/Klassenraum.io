import { EMOTE_COUNT } from '@shared/balance';
import type { ChatEntry } from '@shared/types';
import { t } from '../i18n';
import { emoteSprites, iconDataUrl } from '../render/sprites';
import { store } from '../state';
import { el, id } from './dom';

export function initChat(): void {
  const input = id<HTMLInputElement>('chat-input');
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    store.sendChat(text);
    input.value = '';
  };
  id('chat-send').addEventListener('click', send);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') send();
    ev.stopPropagation();
  });

  const emoteRow = id('emote-row');
  for (let e = 0; e < EMOTE_COUNT; e++) {
    const b = el('button', 'emote-btn');
    const img = el('img');
    img.src = iconDataUrl(emoteSprites[e]!, 3);
    img.alt = '';
    b.appendChild(img);
    b.onclick = () => store.sendEmote(e);
    emoteRow.appendChild(b);
  }

  const panel = id('chat-panel');
  id('chat-toggle').addEventListener('click', () => panel.classList.toggle('collapsed'));
  if (window.innerWidth < 900) panel.classList.add('collapsed');

  store.on('joined', () => {
    id('chat-log').innerHTML = '';
    for (const msg of store.chatLog) appendChat(msg);
  });
  store.on('chat', appendChat);

  // Room happenings become system lines in the notes feed.
  store.on('steal', (s) => {
    const attacker = store.roster.get(s.attacker)?.name ?? '?';
    const victim = store.roster.get(s.victim)?.name ?? '?';
    const youId = store.you?.id;
    if (s.caught) {
      system(
        s.attacker === youId ? t('steal.caught.you') : t('steal.caught.other', { a: attacker }),
        true,
      );
    } else if (s.victim === youId) {
      system(t('steal.hit.you', { a: attacker, v: fmtShort(s.amount) }), true);
    } else if (s.attacker === youId) {
      system(t('steal.success', { v: fmtShort(s.amount), b: victim }));
    } else {
      system(t('steal.hit.other', { a: attacker, v: fmtShort(s.amount), b: victim }));
    }
  });
  store.on('quizResult', (r) => {
    system(t('event.quiz.result', { a: r.answer, n: r.winners.length }));
  });
  store.on('goalDone', () => system(t('goal.done')));
}

function fmtShort(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n));
}

function appendChat(msg: ChatEntry): void {
  const log = id('chat-log');
  const line = el('div', 'chat-line');
  if (msg.id === store.you?.id) line.classList.add('me');
  line.appendChild(el('span', 'who', msg.name + ': '));
  line.appendChild(el('span', '', msg.text));
  log.appendChild(line);
  trimAndScroll(log);
}

export function system(text: string, bad = false): void {
  const log = id('chat-log');
  const line = el('div', `chat-line sys${bad ? ' bad' : ''}`, text);
  log.appendChild(line);
  trimAndScroll(log);
}

function trimAndScroll(log: HTMLElement): void {
  while (log.children.length > 80) log.firstChild?.remove();
  log.scrollTop = log.scrollHeight;
}
