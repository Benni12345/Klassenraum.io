import { t } from './i18n';
import { el, id } from './ui/dom';

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

const clientId = import.meta.env.VITE_ADSENSE_CLIENT?.trim();
const slotId = import.meta.env.VITE_ADSENSE_SLOT?.trim();

function loadAdSenseScript(): Promise<void> {
  if (document.querySelector('script[data-adsense]')) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.crossOrigin = 'anonymous';
    script.dataset.adsense = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('AdSense script failed to load'));
    document.head.appendChild(script);
  });
}

/** Mounts a responsive AdSense unit in the shop sidebar when env vars are set. */
export async function initAds(): Promise<void> {
  const root = id('ad-slot');
  if (!clientId || !slotId) {
    root.classList.add('hidden');
    return;
  }

  root.classList.remove('hidden');
  const label = el('span', 'ad-label', t('ads.label'));
  const ins = el('ins', 'adsbygoogle');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = clientId;
  ins.dataset.adSlot = slotId;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';

  root.append(label, ins);

  try {
    await loadAdSenseScript();
    window.adsbygoogle = window.adsbygoogle ?? [];
    window.adsbygoogle.push({});
  } catch {
    root.classList.add('hidden');
  }
}
