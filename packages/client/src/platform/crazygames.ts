import { setAdMuted, setPlatformMuted } from '../audio';
import type {
  AdCallbacks,
  CrazyGamesGameSettings,
  CrazyGamesUser,
  Platform,
  PlatformUser,
} from './types';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const CLASSROOM_ROOM_ID = 'classroom';

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
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setAdMuted(false);
      resolve(ok);
    };

    const callbacks: AdCallbacks = {
      adStarted: () => setAdMuted(true),
      adFinished: () => finish(true),
      adError: () => finish(false),
    };

    try {
      setAdMuted(true);
      sdk().ad.requestAd(type, callbacks);
    } catch {
      finish(false);
    }
  });
}

function toPlatformUser(user: CrazyGamesUser | null): PlatformUser | null {
  if (!user?.username) return null;
  return { username: user.username };
}

export function createCrazyGamesPlatform(): Platform {
  let gameplay = false;
  let loading = false;
  let bannerId: string | null = null;
  let disableChat = false;
  let muteAudio = false;
  let hasAdblock = false;
  const settingsListeners = new Set<(s: { disableChat: boolean; muteAudio: boolean }) => void>();
  const authListeners = new Set<(user: PlatformUser | null) => void>();

  const applySettings = (s: CrazyGamesGameSettings) => {
    disableChat = Boolean(s.disableChat);
    muteAudio = Boolean(s.muteAudio);
    // CrazyGames host mute must silence all game audio (Full Launch requirement).
    setPlatformMuted(muteAudio);
    for (const fn of settingsListeners) fn({ disableChat, muteAudio });
  };

  const onSdkSettings = (s: CrazyGamesGameSettings) => applySettings(s);
  const onSdkAuth = (user: CrazyGamesUser | null) => {
    const u = toPlatformUser(user);
    for (const fn of authListeners) fn(u);
  };

  return {
    enabled: true,

    get disableChat() {
      return disableChat;
    },

    get muteAudio() {
      return muteAudio;
    },

    get hasAdblock() {
      return hasAdblock;
    },

    async init() {
      await loadScript(SDK_URL);
      await sdk().init();
      applySettings(sdk().game.settings ?? {});
      try {
        sdk().game.addSettingsChangeListener(onSdkSettings);
      } catch {
        /* older SDK builds */
      }
      try {
        if (sdk().user?.isUserAccountAvailable) {
          sdk().user.addAuthListener(onSdkAuth);
        }
      } catch {
        /* auth optional outside CrazyGames */
      }
      try {
        hasAdblock = Boolean(await sdk().ad.hasAdblock());
      } catch {
        hasAdblock = false;
      }
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

    happytime() {
      void sdk().game.happytime().catch(() => {});
    },

    markRoomJoinable() {
      void sdk()
        .game.updateRoom({
          roomId: CLASSROOM_ROOM_ID,
          isJoinable: true,
        })
        .catch(() => {});
    },

    async requestMidgameAd() {
      const wasPlaying = gameplay;
      this.onGameplayStop();
      const ok = await requestAd('midgame');
      if (wasPlaying) this.onGameplayStart();
      return ok;
    },

    async requestRewardedAd() {
      if (hasAdblock) return false;
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
          /* unfilled, cooldown, or temporarily unavailable */
        });
    },

    hideModalBanner() {
      if (!bannerId) return;
      const id = bannerId;
      bannerId = null;
      try {
        sdk().banner.clearBanner(id);
      } catch {
        /* clear may fail if SDK not ready; still clear DOM */
      }
      const slot = document.getElementById(id);
      if (slot) {
        slot.replaceChildren();
        slot.style.display = 'none';
      }
    },

    async getUser() {
      try {
        if (!sdk().user?.isUserAccountAvailable) return null;
        return toPlatformUser(await sdk().user.getUser());
      } catch {
        return null;
      }
    },

    async getUserToken() {
      try {
        if (!sdk().user?.isUserAccountAvailable) return null;
        return await sdk().user.getUserToken();
      } catch {
        return null;
      }
    },

    async showAuthPrompt() {
      try {
        if (!sdk().user?.isUserAccountAvailable) return null;
        return toPlatformUser(await sdk().user.showAuthPrompt());
      } catch {
        return null;
      }
    },

    onAuthChange(listener) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },

    onSettingsChange(listener) {
      settingsListeners.add(listener);
      listener({ disableChat, muteAudio });
      return () => settingsListeners.delete(listener);
    },
  };
}
