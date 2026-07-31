import { brainIcon, iconDataUrl, px } from '../render/sprites';
import { getLocale, t } from '../i18n';
import { platform } from '../platform';
import { store } from '../state';
import { id } from './dom';
import { pushOverlay } from './overlay';

const DOC_ICON = px(
  ['WWWWW.', 'WggW#.', 'WWWWWW', 'WggggW', 'WWWWWW', 'WggggW', 'WWWWWW'],
  { W: '#e8e8e8', g: '#9a9a9a', '#': '#c8c8c8' },
);

let bossActive = false;
let releaseOverlay: (() => void) | null = null;
const gameTitle = 'Classroom.io';
let gameIcon = '';
let bossIcon = '';

/** Toolbar / page copy for the Tab boss-key disguise. */
function paintBossDoc(): void {
  id('boss-doc-title').textContent = t('boss.title');
  id('boss-doc-meta').textContent = t('boss.meta');
  id('boss-close').textContent = t('ui.close');
  id('boss-close').title = t('boss.hint');
  id('boss-menu-file').textContent = t('boss.menu.file');
  id('boss-menu-edit').textContent = t('boss.menu.edit');
  id('boss-menu-view').textContent = t('boss.menu.view');
  id('boss-menu-insert').textContent = t('boss.menu.insert');
  id('boss-menu-format').textContent = t('boss.menu.format');
  id('boss-menu-tools').textContent = t('boss.menu.tools');
  id('boss-h1').textContent = t('boss.h1');
  id('boss-p1').innerHTML = `<b>${t('boss.p1.label')}</b> ${t('boss.p1.body')}`;
  id('boss-p2').innerHTML = `<b>${t('boss.p2.label')}</b> ${t('boss.p2.body')}`;
  const list = id('boss-list');
  list.innerHTML = '';
  for (let i = 1; i <= 4; i++) {
    const li = document.createElement('li');
    li.textContent = t(`boss.li${i}`);
    list.appendChild(li);
  }
  id('boss-ex').innerHTML = `<b>${t('boss.ex.label')}</b> ${t('boss.ex.body')}`;
  id('boss-ex2').textContent = t('boss.ex2');
  // Keep the document language in sync with the selected UI language.
  id('boss-overlay').lang = getLocale();
}

export function initBoss(): void {
  gameIcon = iconDataUrl(brainIcon, 4);
  bossIcon = iconDataUrl(DOC_ICON, 4);
  setFavicon(gameIcon);
  document.title = gameTitle;
  paintBossDoc();

  // Tab, not Esc: Esc is the browser shortcut for leaving fullscreen.
  // Capture phase so the shortcut also works while an input has focus.
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Tab' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      ev.preventDefault();
      toggleBoss();
    },
    true,
  );
  id('boss-close').addEventListener('click', () => toggleBoss(false));
}

/** Refresh math-notes copy when the player switches language. */
export function refreshBossTexts(): void {
  paintBossDoc();
  if (bossActive) document.title = t('boss.title');
}

export function isBossActive(): boolean {
  return bossActive;
}

export function toggleBoss(force?: boolean): void {
  bossActive = force ?? !bossActive;
  id('boss-overlay').classList.toggle('hidden', !bossActive);
  id('app').style.visibility = bossActive ? 'hidden' : 'visible';
  if (bossActive) {
    paintBossDoc();
    releaseOverlay = pushOverlay();
    platform.onGameplayStop();
    document.title = t('boss.title');
    setFavicon(bossIcon);
  } else {
    releaseOverlay?.();
    releaseOverlay = null;
    if (store.you && store.status === 'open') platform.onGameplayStart();
    document.title = gameTitle;
    setFavicon(gameIcon);
  }
}

function setFavicon(href: string): void {
  id<HTMLLinkElement>('favicon').href = href;
}
