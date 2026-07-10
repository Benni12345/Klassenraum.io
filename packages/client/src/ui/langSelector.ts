import { getLocale, LOCALES, setLocale, t, type Locale } from '../i18n';
import { el } from './dom';
import { applyStaticTexts } from './texts';

const LANG_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

export type LangSelectorOptions = {
  /** Show a "Language:" label (for modals). */
  label?: boolean;
  /** Compact layout for the HUD. */
  compact?: boolean;
  /** Called after the locale changes. */
  onChange?: () => void;
};

const mounted: Set<HTMLElement> = new Set();

function refreshMounted(): void {
  for (const wrap of mounted) {
    for (const btn of wrap.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
      btn.classList.toggle('gold', btn.dataset.lang === getLocale());
    }
  }
}

/** Builds a DE/EN toggle; highlights the active locale. */
export function buildLangSelector(opts: LangSelectorOptions = {}): HTMLElement {
  const wrap = el('div', opts.compact ? 'lang-selector compact' : 'lang-selector');
  if (opts.label) wrap.appendChild(el('span', 'lang-label', t('settings.lang') + ':'));

  const btns = el('div', 'lang-btns');
  for (const l of LOCALES) {
    const btn = el('button', `btn small ${getLocale() === l ? 'gold' : ''}`, l.toUpperCase());
    btn.type = 'button';
    btn.title = LANG_NAMES[l];
    btn.dataset.lang = l;
    btn.onclick = () => {
      if (getLocale() === l) return;
      setLocale(l);
      applyStaticTexts();
      refreshMounted();
      opts.onChange?.();
    };
    btns.appendChild(btn);
  }
  wrap.appendChild(btns);

  if (opts.compact) mounted.add(wrap);
  return wrap;
}

/** Mounts a compact language selector into a container (e.g. HUD). */
export function initLangSelector(parentId: string): void {
  const parent = document.getElementById(parentId);
  if (!parent) return;
  parent.appendChild(buildLangSelector({ compact: true }));
}
