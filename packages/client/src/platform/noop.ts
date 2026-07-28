import type { Platform, PlatformUser } from './types';

/** Stand-in when not building for CrazyGames (dev, self-host, Vercel). */
export function createNoopPlatform(): Platform {
  return {
    enabled: false,
    disableChat: false,
    hasAdblock: false,
    async init() {},
    loadingDone() {},
    onGameplayStart() {},
    onGameplayStop() {},
    happytime() {},
    markRoomJoinable() {},
    async requestMidgameAd() {
      return false;
    },
    async requestRewardedAd() {
      return false;
    },
    showModalBanner() {},
    hideModalBanner() {},
    async getUser() {
      return null;
    },
    async getUserToken() {
      return null;
    },
    async showAuthPrompt() {
      return null;
    },
    onAuthChange() {
      return () => {};
    },
    onSettingsChange() {
      return () => {};
    },
  };
}

export type { PlatformUser };
