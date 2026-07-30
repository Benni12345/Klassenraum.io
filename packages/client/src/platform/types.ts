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

export type InviteParams = Record<string, string>;

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
      inviteParams?: InviteParams;
    }): Promise<void>;
    leftRoom?(): Promise<void>;
    addJoinRoomListener?(listener: (params: InviteParams) => void): void;
    removeJoinRoomListener?(listener: (params: InviteParams) => void): void;
    inviteLink?(params: InviteParams): string;
    showInviteButton?(params: InviteParams): string;
    hideInviteButton?(): void;
    inviteParams?: InviteParams | null;
    getInviteParam?(key: string): string | null;
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

export interface BannerSize {
  width: number;
  height: number;
}

export interface Platform {
  readonly enabled: boolean;
  /** True when CrazyGames asked us to hide chat. */
  disableChat: boolean;
  /** True when CrazyGames (or `?muteAudio=true`) asked us to mute. */
  muteAudio: boolean;
  /** True when an adblocker was detected: no banner placeholder, no rewarded. */
  hasAdblock: boolean;
  /** True when the player launched straight into multiplayer from CrazyGames. */
  isInstantMultiplayer: boolean;
  init(): Promise<void>;
  loadingDone(): void;
  onGameplayStart(): void;
  onGameplayStop(): void;
  happytime(): void;
  /** Mark the shared classroom as joinable for the CrazyGames friends UI. */
  markRoomJoinable(): void;
  /** Ask CrazyGames to show its invite button for the shared classroom. */
  showInviteButton(): void;
  /** Invite link for the shared classroom, or null outside CrazyGames. */
  inviteLink(): string | null;
  /** Fires when a friend join lands in an already-running game. */
  onJoinRoom(listener: () => void): () => void;
  requestMidgameAd(): Promise<boolean>;
  requestRewardedAd(): Promise<boolean>;
  /**
   * Requests a banner into an already sized, fully visible container. Callers
   * own the refresh cadence — the platform never re-requests on its own.
   */
  requestBanner(containerId: string, size: BannerSize): void;
  clearBanner(containerId: string): void;
  /** Logged-in CrazyGames user, if any. */
  getUser(): Promise<PlatformUser | null>;
  /** JWT for server-side account linking; null when guest / unavailable. */
  getUserToken(): Promise<string | null>;
  /** Prefer guest play; optional CG login prompt (not a main CTA). */
  showAuthPrompt(): Promise<PlatformUser | null>;
  onAuthChange(listener: (user: PlatformUser | null) => void): () => void;
  onSettingsChange(listener: (s: { disableChat: boolean; muteAudio: boolean }) => void): () => void;
}
