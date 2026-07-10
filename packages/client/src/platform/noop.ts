import type { Platform } from './types';

/** Stand-in when not building for CrazyGames (dev, self-host, Vercel). */
export function createNoopPlatform(): Platform {
  return {
    enabled: false,
    async init() {},
    loadingDone() {},
    onGameplayStart() {},
    onGameplayStop() {},
    async requestMidgameAd() {
      return false;
    },
    async requestRewardedAd() {
      return false;
    },
    showModalBanner() {},
    hideModalBanner() {},
  };
}
