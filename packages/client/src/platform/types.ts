export type AdKind = 'midgame' | 'rewarded';

export interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

export interface CrazyGamesUser {
  username: string;
  profilePictureUrl?: string;
}

export interface CrazyGamesGameSettings {
  disableChat?: boolean;
  muteAudio?: boolean;
}

export interface CrazyGamesSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): Promise<void>;
    loadingStop(): Promise<void>;
    gameplayStart(): Promise<void>;
    gameplayStop(): Promise<void>;
    happytime(): Promise<void>;
    settings: CrazyGamesGameSettings;
    addSettingsChangeListener(listener: (s: CrazyGamesGameSettings) => void): void;
    removeSettingsChangeListener(listener: (s: CrazyGamesGameSettings) => void): void;
    updateRoom(opts: {
      roomId?: string;
      isJoinable?: boolean;
      inviteParams?: Record<string, string>;
    }): Promise<void>;
    isInstantMultiplayer?: boolean;
  };
  ad: {
    requestAd(type: AdKind, callbacks?: AdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  banner: {
    requestBanner(opts: { id: string; width: number; height: number }): Promise<void>;
    clearBanner(id: string): void;
    clearAllBanners(): void;
  };
  user: {
    isUserAccountAvailable: boolean;
    getUser(): Promise<CrazyGamesUser | null>;
    getUserToken(): Promise<string>;
    addAuthListener(listener: (user: CrazyGamesUser | null) => void): void;
    removeAuthListener(listener: (user: CrazyGamesUser | null) => void): void;
    showAuthPrompt(): Promise<CrazyGamesUser>;
  };
  system?: {
    getInfo?(): { countryCode?: string; locale?: string };
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

export interface PlatformUser {
  username: string;
}

export interface Platform {
  readonly enabled: boolean;
  /** True when CrazyGames asked us to hide chat. */
  disableChat: boolean;
  /** True when an adblocker was detected (rewarded ads must not stay clickable). */
  hasAdblock: boolean;
  init(): Promise<void>;
  loadingDone(): void;
  onGameplayStart(): void;
  onGameplayStop(): void;
  happytime(): void;
  /** Mark the shared classroom as joinable for CrazyGames friends UI. */
  markRoomJoinable(): void;
  requestMidgameAd(): Promise<boolean>;
  requestRewardedAd(): Promise<boolean>;
  showModalBanner(containerId: string): void;
  hideModalBanner(): void;
  /** Logged-in CrazyGames user, if any. */
  getUser(): Promise<PlatformUser | null>;
  /** JWT for server-side account linking; null when guest / unavailable. */
  getUserToken(): Promise<string | null>;
  /** Prefer guest play; optional CG login prompt (not a main CTA). */
  showAuthPrompt(): Promise<PlatformUser | null>;
  onAuthChange(listener: (user: PlatformUser | null) => void): () => void;
  onSettingsChange(listener: (s: { disableChat: boolean }) => void): () => void;
}
