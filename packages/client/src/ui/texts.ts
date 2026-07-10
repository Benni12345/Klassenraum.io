import { getLocale, t } from '../i18n';
import { id } from './dom';

/** (Re)applies all static UI labels; called at boot and on language change. */
export function applyStaticTexts(): void {
  document.documentElement.lang = getLocale();
  id('click-label').textContent = t('shop.click');
  id('shop-title').textContent = t('shop.title');
  id('upgrades-title').textContent = t('shop.upgrades');
  id('buy-label').textContent = t('shop.buyLabel');
  id('qty-max').textContent = t('shop.max');
  id<HTMLInputElement>('chat-input').placeholder = t('chat.placeholder');
  id('chat-send').textContent = t('chat.send');
  id('chat-toggle').textContent = t('chat.title');
  id('btn-my-desk').textContent = t('misc.myDesk');
  id('btn-prestige').textContent = t('prestige.button');
  id('btn-leaderboard').title = t('leaderboard.title');
  id('btn-settings').title = t('settings.title');
  id('quiz-submit').textContent = t('event.quiz.submit');
  id<HTMLInputElement>('quiz-input').placeholder = t('event.quiz.prompt');
  id('conn-banner').textContent = t('conn.lost');
  id('footer-tagline').textContent = t('footer.tagline');
  id('footer-about').textContent = t('footer.about');
  id('footer-guide').textContent = t('footer.guide');
  id('footer-privacy').textContent = t('footer.privacy');
  id('footer-impressum').textContent = t('footer.impressum');
}
