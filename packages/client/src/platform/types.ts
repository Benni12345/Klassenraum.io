export type AdKind = 'midgame' | 'rewarded';

export interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

export interface CrazyGamesSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): Promise<void>;
    loadingStop(): Promise<void>;
    gameplayStart(): Promise<void>;
    gameplayStop(): Promise<void>;
  };
  ad: {
    requestAd(type: AdKind, callbacks?: AdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  banner: {
    requestBanner(opts: { id: string; width: number; height: number }): Promise<void>;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

export interface Platform {
  readonly enabled: boolean;
  init(): Promise<void>;
  loadingDone(): void;
  onGameplayStart(): void;
  onGameplayStop(): void;
  requestMidgameAd(): Promise<boolean>;
  requestRewardedAd(): Promise<boolean>;
  showModalBanner(containerId: string): void;
  hideModalBanner(): void;
}
