import type { Platform } from '@comment-automations/gateway-contract';
import { rules as bluesky } from './bluesky.js';
import { rules as facebook } from './facebook.js';
import { rules as instagram } from './instagram.js';
import { rules as linkedin } from './linkedin.js';
import { rules as pinterest } from './pinterest.js';
import type { Rules } from './rules.js';
import { rules as threads } from './threads.js';
import { rules as tiktok } from './tiktok.js';
import { rules as whatsapp } from './whatsapp.js';
import { rules as x } from './x.js';
import { rules as youtube } from './youtube.js';

export const worlds: Record<Platform, Rules> = {
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

export const platforms = Object.keys(worlds) as Platform[];

export const isPlatform = (value: string): value is Platform => value in worlds;
