import { createCrazyGamesPlatform } from './crazygames';
import { createNoopPlatform } from './noop';
import type { Platform } from './types';

export type { Platform } from './types';

export const platform: Platform = import.meta.env.VITE_CRAZYGAMES
  ? createCrazyGamesPlatform()
  : createNoopPlatform();
