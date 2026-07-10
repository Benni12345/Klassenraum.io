import type { AdCallbacks, Platform } from './types';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

function sdk() {
  const s = window.CrazyGames?.SDK;
  if (!s) throw new Error('CrazyGames SDK not loaded');
  return s;
}

function requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
  return new Promise((resolve) => {
    let started = false;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const callbacks: AdCallbacks = {
      adStarted: () => {
        started = true;
      },
      adFinished: () => finish(true),
      adError: () => {
        if (started) finish(false);
        else finish(false);
      },
    };

    try {
      sdk().ad.requestAd(type, callbacks);
    } catch {
      finish(false);
    }
  });
}

export function createCrazyGamesPlatform(): Platform {
  let gameplay = false;
  let loading = false;
  let bannerId: string | null = null;

  return {
    enabled: true,

    async init() {
      await loadScript(SDK_URL);
      await sdk().init();
      await sdk().game.loadingStart();
      loading = true;
    },

    loadingDone() {
      if (!loading) return;
      loading = false;
      void sdk().game.loadingStop();
    },

    onGameplayStart() {
      if (gameplay) return;
      gameplay = true;
      void sdk().game.gameplayStart();
    },

    onGameplayStop() {
      if (!gameplay) return;
      gameplay = false;
      void sdk().game.gameplayStop();
    },

    async requestMidgameAd() {
      const wasPlaying = gameplay;
      this.onGameplayStop();
      const ok = await requestAd('midgame');
      if (wasPlaying) this.onGameplayStart();
      return ok;
    },

    async requestRewardedAd() {
      const wasPlaying = gameplay;
      this.onGameplayStop();
      const ok = await requestAd('rewarded');
      if (wasPlaying) this.onGameplayStart();
      return ok;
    },

    showModalBanner(containerId: string) {
      bannerId = containerId;
      void sdk()
        .banner.requestBanner({ id: containerId, width: 300, height: 250 })
        .catch(() => {
          /* unfilled / cooldown — game continues normally */
        });
    },

    hideModalBanner() {
      if (!bannerId) return;
      const id = bannerId;
      bannerId = null;
      const banner = sdk().banner;
      if (banner.clearBanner) banner.clearBanner(id);
      else banner.clearAllBanners?.();
    },
  };
}
