import type { CapabilityRecord } from '../capabilities.js';
import type { Platform } from '../platform.js';
import { bluesky } from './bluesky.js';
import { facebook } from './facebook.js';
import { instagram } from './instagram.js';
import { linkedin } from './linkedin.js';
import { pinterest } from './pinterest.js';
import { threads } from './threads.js';
import { tiktok } from './tiktok.js';
import { whatsapp } from './whatsapp.js';
import { x } from './x.js';
import { youtube } from './youtube.js';

export const capabilities: Record<Platform, CapabilityRecord> = {
  instagram,
  facebook,
  threads,
  x,
  bluesky,
  youtube,
  linkedin,
  whatsapp,
  tiktok,
  pinterest,
};
