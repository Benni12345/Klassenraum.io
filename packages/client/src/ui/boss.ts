import { brainIcon, iconDataUrl, px } from '../render/sprites';
import { t } from '../i18n';
import { platform } from '../platform';
import { store } from '../state';
import { id } from './dom';

const DOC_ICON = px(
  ['WWWWW.', 'WggW#.', 'WWWWWW', 'WggggW', 'WWWWWW', 'WggggW', 'WWWWWW'],
  { W: '#e8e8e8', g: '#9a9a9a', '#': '#c8c8c8' },
);

let bossActive = false;
let gameTitle = 'Klassenraum.io';
let gameIcon = '';
let bossIcon = '';

export function initBoss(): void {
  gameIcon = iconDataUrl(brainIcon, 4);
  bossIcon = iconDataUrl(DOC_ICON, 4);
  setFavicon(gameIcon);
  document.title = gameTitle;

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      toggleBoss();
    }
  });
  id('boss-close').addEventListener('click', () => toggleBoss(false));
}

export function toggleBoss(force?: boolean): void {
  bossActive = force ?? !bossActive;
  id('boss-overlay').classList.toggle('hidden', !bossActive);
  id('app').style.visibility = bossActive ? 'hidden' : 'visible';
  if (bossActive) {
    platform.onGameplayStop();
    document.title = t('boss.title');
    id('boss-doc-title').textContent = t('boss.title');
    setFavicon(bossIcon);
  } else {
    if (store.you && store.status === 'open') platform.onGameplayStart();
    document.title = gameTitle;
    setFavicon(gameIcon);
  }
}

function setFavicon(href: string): void {
  id<HTMLLinkElement>('favicon').href = href;
}
