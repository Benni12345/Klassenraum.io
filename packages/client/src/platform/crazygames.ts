import { setAdMuted, setPlatformMuted } from '../audio';
import type {
  AdCallbacks,
  BannerSize,
  CrazyGamesGameSettings,
  CrazyGamesUser,
  InviteParams,
  Platform,
  PlatformUser,
} from './types';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const CLASSROOM_ROOM_ID = 'classroom';
const ROOM_INVITE_PARAMS: InviteParams = { room: CLASSROOM_ROOM_ID };

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
  let instantMultiplayer = false;
  const settingsListeners = new Set<(s: { disableChat: boolean; muteAudio: boolean }) => void>();
  const authListeners = new Set<(user: PlatformUser | null) => void>();
  const joinRoomListeners = new Set<() => void>();

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
  const onSdkJoinRoom = () => {
    for (const fn of joinRoomListeners) fn();
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

    get isInstantMultiplayer() {
      return instantMultiplayer;
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
        sdk().game.addJoinRoomListener?.(onSdkJoinRoom);
      } catch {
        /* multiplayer join listener optional */
      }
      try {
        instantMultiplayer = Boolean(sdk().game.isInstantMultiplayer);
      } catch {
        instantMultiplayer = false;
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
      // One global classroom: always open, so friends can always drop in.
      void sdk()
        .game.updateRoom({
          roomId: CLASSROOM_ROOM_ID,
          isJoinable: true,
          inviteParams: ROOM_INVITE_PARAMS,
        })
        .catch(() => {});
    },

    showInviteButton() {
      try {
        sdk().game.showInviteButton?.(ROOM_INVITE_PARAMS);
      } catch {
        /* invite button optional */
      }
    },

    inviteLink() {
      try {
        return sdk().game.inviteLink?.(ROOM_INVITE_PARAMS) ?? null;
      } catch {
        return null;
      }
    },

    onJoinRoom(listener) {
      joinRoomListeners.add(listener);
      return () => joinRoomListeners.delete(listener);
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

    requestBanner(containerId: string, size: BannerSize) {
      if (hasAdblock) return;
      activeBanners.add(containerId);
      void sdk()
        .banner.requestBanner({ id: containerId, width: size.width, height: size.height })
        .catch((err) => {
          if (import.meta.env.DEV) console.debug('[ads] banner error', containerId, err);
        });
    },

    clearBanner(containerId: string) {
      if (!activeBanners.has(containerId)) return;
      activeBanners.delete(containerId);
      try {
        sdk().banner.clearBanner(containerId);
      } catch {
        /* clear may fail if SDK not ready; still clear DOM */
      }
      document.getElementById(containerId)?.replaceChildren();
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
