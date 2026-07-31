/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
  readonly VITE_CRAZYGAMES?: string;
  /** When "true", never request or reserve space for banner ads (QA / test builds). */
  readonly VITE_NO_BANNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
