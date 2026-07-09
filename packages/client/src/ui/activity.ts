import { GENERATORS } from '@shared/balance';
import type { ActivityEntry } from '@shared/types';
import { t } from '../i18n';
import { store } from '../state';
import { el, id } from './dom';

function formatActivity(a: ActivityEntry): string {
  const name = a.name;
  switch (a.kind) {
    case 'click':
      return t('activity.click', { n: name });
    case 'buy': {
      const gi = Number(a.meta);
      const gen = GENERATORS[gi];
      const gname = gen ? t(`gen.${gen.id}.name`) : '?';
      return t('activity.buy', { n: name, g: gname });
    }
    case 'upgrade':
      return t('activity.upgrade', { n: name });
    case 'prestige':
      return t('activity.prestige', { n: name });
    case 'steal':
      return t('activity.steal', { n: name, v: a.meta ?? '?' });
    case 'quiz':
      return t('activity.quiz', { n: name });
    default:
      return name;
  }
}

export function initActivityFeed(): void {
  const panel = id('activity-panel');
  const toggle = id('activity-toggle');
  const log = id('activity-log');

  toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));

  const render = () => {
    log.replaceChildren();
    const items = store.activityLog.slice(-12).reverse();
    for (const a of items) {
      const row = el('div', 'activity-row');
      row.textContent = formatActivity(a);
      log.appendChild(row);
    }
  };

  store.on('activity', () => render());
  store.on('joined', () => render());
  render();
}
