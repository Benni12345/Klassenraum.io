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

function requestAd(
  type: 'midgame' | 'rewarded',
  hooks?: { onStarted?: () => void; onEnded?: () => void },
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setAdMuted(false);
      if (started) hooks?.onEnded?.();
      resolve(ok);
    };

    const callbacks: AdCallbacks = {
      adStarted: () => {
        started = true;
        setAdMuted(true);
        hooks?.onStarted?.();
      },
      adFinished: () => finish(true),
      adError: () => finish(false),
    };

    try {
      // Do not pause/mute until adStarted — cooldown/unfilled midgames error immediately.
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
  const activeBanners = new Set<string>();
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

  const showBanner = (containerId: string, size?: { width: number; height: number }) => {
    const width = size?.width ?? 300;
    const height = size?.height ?? 250;
    activeBanners.add(containerId);
    const el = document.getElementById(containerId);
    if (el) {
      el.style.display = 'flex';
      // CrazyGames requires an explicit sized container or the request fails (notVisible / invalid).
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.minWidth = `${width}px`;
      el.style.minHeight = `${height}px`;
    }
    void sdk()
      .banner.requestBanner({ id: containerId, width, height })
      .catch((err) => {
        if (import.meta.env.DEV) console.debug('[ads] banner error', containerId, err);
      });
  };

  const hideBanner = (containerId: string) => {
    if (!activeBanners.has(containerId) && !document.getElementById(containerId)) return;
    activeBanners.delete(containerId);
    try {
      sdk().banner.clearBanner(containerId);
    } catch {
      /* clear may fail if SDK not ready; still clear DOM */
    }
    const slot = document.getElementById(containerId);
    if (slot) {
      slot.replaceChildren();
      slot.style.display = 'none';
    }
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
      return requestAd('midgame', {
        onStarted: () => this.onGameplayStop(),
        onEnded: () => this.onGameplayStart(),
      });
    },

    async requestRewardedAd() {
      if (hasAdblock) return false;
      return requestAd('rewarded', {
        onStarted: () => this.onGameplayStop(),
        onEnded: () => this.onGameplayStart(),
      });
    },

    showBanner,
    hideBanner,
    showModalBanner(containerId: string) {
      showBanner(containerId, { width: 300, height: 250 });
    },
    hideModalBanner() {
      hideBanner('cg-modal-banner');
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
