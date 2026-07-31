import { setPlatformMuted } from '../audio';
import type { Platform, PlatformUser } from './types';

function urlMuteAudio(): boolean {
  try {
    return new URLSearchParams(location.search).get('muteAudio') === 'true';
  } catch {
    return false;
  }
}

/** Stand-in when not building for CrazyGames (dev, self-host, Vercel). */
export function createNoopPlatform(): Platform {
  const muteAudio = urlMuteAudio();
  if (muteAudio) setPlatformMuted(true);

  return {
    enabled: false,
    disableChat: false,
    muteAudio,
    hasAdblock: false,
    isInstantMultiplayer: false,
    deviceType: null,
    async init() {},
    loadingDone() {},
    onGameplayStart() {},
    onGameplayStop() {},
    happytime() {},
    markRoomJoinable() {},
    showInviteButton() {},
    inviteLink() {
      return null;
    },
    onJoinRoom() {
      return () => {};
    },
    async requestMidgameAd() {
      return false;
    },
    async requestRewardedAd() {
      return false;
    },
    requestBanner() {},
    clearBanner() {},
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
    onSettingsChange(listener) {
      listener({ disableChat: false, muteAudio });
      return () => {};
    },
  };
}

export type { PlatformUser };
