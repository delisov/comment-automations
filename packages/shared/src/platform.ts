export const PLATFORMS = [
  'instagram',
  'facebook',
  'threads',
  'x',
  'bluesky',
  'youtube',
  'linkedin',
  'whatsapp',
  'tiktok',
  'pinterest',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
};
