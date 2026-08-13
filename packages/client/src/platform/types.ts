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

export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export interface CrazyGamesSystemInfo {
  countryCode?: string;
  locale?: string;
  device?: { type?: DeviceType | string };
  os?: { name?: string; version?: string };
  browser?: { name?: string; version?: string };
  applicationType?: string;
}

export interface CrazyGamesSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): Promise<void> | void;
    loadingStop(): Promise<void> | void;
    gameplayStart(): Promise<void> | void;
    gameplayStop(): Promise<void> | void;
    happytime(): Promise<void> | void;
    settings: CrazyGamesGameSettings;
    addSettingsChangeListener(listener: (s: CrazyGamesGameSettings) => void): void;
    removeSettingsChangeListener(listener: (s: CrazyGamesGameSettings) => void): void;
    updateRoom(opts: {
      roomId?: string;
      isJoinable?: boolean;
      inviteParams?: InviteParams;
    }): Promise<void> | void;
    leftRoom?(): Promise<void> | void;
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
    requestBanner(opts: {
      id: string;
      width: number;
      height: number;
    }): Promise<void> | void;
    clearBanner(id: string): void;
    clearAllBanners(): void;
  };
  /** Cloud-synced key/value store (localStorage-compatible API). */
  data?: {
    clear(): void;
    getItem(key: string): string | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;
  };
  user: {
    isUserAccountAvailable: boolean;
    getUser(): Promise<CrazyGamesUser | null>;
    getUserToken(): Promise<string>;
    addAuthListener(listener: (user: CrazyGamesUser | null) => void): void;
    removeAuthListener(listener: (user: CrazyGamesUser | null) => void): void;
    showAuthPrompt(): Promise<CrazyGamesUser>;
    /** v3 sync system info (device / locale / OS). */
    systemInfo?: CrazyGamesSystemInfo;
    /** Older SDK builds exposed an async getter instead. */
    getSystemInfo?(): Promise<CrazyGamesSystemInfo>;
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

/** Result of resolving CrazyGames login before (and during) the hello handshake. */
export interface PlatformAuth {
  token: string | null;
  loggedIn: boolean;
  username: string | null;
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
  /**
   * Device class from CrazyGames SystemInfo when available.
   * `null` outside CrazyGames / when unknown — callers should fall back to
   * viewport heuristics.
   */
  deviceType: DeviceType | null;
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
   * - `filled`: ad rendered (or cooldown — prior request still live)
   * - `empty`: noFill / hard error — safe to hide the placeholder
   * - `retry`: container not visible yet — caller should try again shortly
   */
  requestBanner(containerId: string, size: BannerSize): Promise<'filled' | 'empty' | 'retry'>;
  clearBanner(containerId: string): void;
  /** Logged-in CrazyGames user, if any. */
  getUser(): Promise<PlatformUser | null>;
  /** JWT for server-side account linking; null when guest / unavailable. */
  getUserToken(): Promise<string | null>;
  /**
   * Login + JWT, with retries for the SDK startup race. `loggedIn` can be true
   * even when `token` is still null — callers must not fall back to a guest save.
   */
  getAuth(): Promise<PlatformAuth>;
  /** Prefer guest play; optional CG login prompt (not a main CTA). */
  showAuthPrompt(): Promise<PlatformUser | null>;
  onAuthChange(listener: (user: PlatformUser | null) => void): () => void;
  onSettingsChange(listener: (s: { disableChat: boolean; muteAudio: boolean }) => void): () => void;
  /**
   * CrazyGames Data module (cloud-synced for logged-in users). Returns null
   * outside CrazyGames or when the module is disabled.
   */
  getDataItem(key: string): string | null;
  setDataItem(key: string, value: string): void;
}
