import type { CSSProperties } from 'react';

export type PoolWebsiteAchievement = {
  title: string;
  detail: string;
};

export type PoolWebsiteBatch = {
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

export type PoolWebsiteCoach = {
  name: string;
  role: string;
};

export type PoolWebsiteContent = {
  poolName: string;
  poolAddress: string;
  poolLogoUrl: string | null;
  about: string;
  history: string;
  openingHours: string;
  facilities: string;
  batchesText: string;
  coachesText: string;
  achievements: PoolWebsiteAchievement[];
  batches: PoolWebsiteBatch[];
  coaches: PoolWebsiteCoach[];
  bannerPhotoUrl: string | null;
  historyPhotoUrl: string | null;
  infoPhotoUrl: string | null;
  batchesPhotoUrl: string | null;
  coachesPhotoUrl: string | null;
  achievementsPhotoUrl: string | null;
  themeColor: string;
};

export const WEBSITE_PHOTO_KEYS = [
  'banner',
  'history',
  'info',
  'batches',
  'coaches',
  'achievements',
] as const;

export type WebsitePhotoKey = (typeof WEBSITE_PHOTO_KEYS)[number];

export const DEFAULT_WEBSITE_THEME = '#1e88c8';

export const WEBSITE_THEME_PRESETS = [
  '#1e88c8',
  '#0f766e',
  '#166534',
  '#1e3a8a',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#0f2748',
] as const;

export function parseThemeColor(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_WEBSITE_THEME;
}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number) {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, other: { r: number; g: number; b: number }, amount: number) {
  const a = hexToRgb(hex);
  return toHex(
    a.r + (other.r - a.r) * amount,
    a.g + (other.g - a.g) * amount,
    a.b + (other.b - a.b) * amount,
  );
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function websiteThemeStyle(raw: unknown): CSSProperties {
  const color = parseThemeColor(raw);
  const ink = mix(color, { r: 15, g: 39, b: 72 }, 0.72);
  const text = mix(color, { r: 58, g: 85, b: 120 }, 0.55);
  const muted = mix(color, { r: 91, g: 122, b: 153 }, 0.42);
  return {
    '--pool-accent': color,
    '--pool-accent-hover': mix(color, { r: 0, g: 0, b: 0 }, 0.18),
    '--pool-ink': ink,
    '--pool-text': text,
    '--pool-muted': muted,
    '--pool-border': mix(color, { r: 215, g: 228, b: 244 }, 0.72),
    '--pool-line': mix(color, { r: 232, g: 240, b: 248 }, 0.78),
    '--pool-page-from': mix(color, { r: 255, g: 255, b: 255 }, 0.92),
    '--pool-page-to': mix(color, { r: 234, g: 244, b: 251 }, 0.78),
    '--pool-glow': rgba(color, 0.28),
    '--pool-overlay': rgba(mix(color, { r: 8, g: 24, b: 48 }, 0.62), 0.86),
    '--pool-kicker': mix(color, { r: 177, g: 250, b: 252 }, 0.55),
    '--pool-cta-hover': mix(color, { r: 255, g: 255, b: 255 }, 0.9),
    '--pool-banner-fill': mix(color, { r: 135, g: 206, b: 235 }, 0.35),
  } as CSSProperties;
}

export const SAMPLE_WEBSITE_BATCHES: PoolWebsiteBatch[] = [
  { name: 'Morning A', type: 'Mixed', startTime: '06:00', endTime: '07:00' },
  { name: 'Morning B', type: 'Mixed', startTime: '07:15', endTime: '08:15' },
  { name: 'Ladies', type: 'Ladies', startTime: '09:00', endTime: '10:00' },
  { name: 'Evening A', type: 'Mixed', startTime: '17:30', endTime: '18:30' },
  { name: 'Evening B', type: 'Competitive', startTime: '18:45', endTime: '19:45' },
];

export const SAMPLE_WEBSITE_COACHES: PoolWebsiteCoach[] = [
  { name: 'Riya Kulkarni', role: 'Head coach' },
  { name: 'Amit Sharma', role: 'Coach' },
  { name: 'Neha Deshmukh', role: 'Coach' },
];

export const SAMPLE_WEBSITE_ACHIEVEMENTS: PoolWebsiteAchievement[] = [
  {
    title: 'State-level medals',
    detail: 'Swimmers from this pool regularly finish on the podium at district and state meets.',
  },
  {
    title: 'Learn-to-swim programme',
    detail: 'Hundreds of beginners have learned to swim safely through structured batches.',
  },
  {
    title: 'Competitive training',
    detail: 'Dedicated evening batches prepare swimmers for club and school competitions.',
  },
];

export function emptyWebsiteContent(): PoolWebsiteContent {
  return {
    poolName: '',
    poolAddress: '',
    poolLogoUrl: null,
    about: '',
    history: '',
    openingHours: '',
    facilities: '',
    batchesText: '',
    coachesText: '',
    achievements: [],
    batches: [],
    coaches: [],
    bannerPhotoUrl: null,
    historyPhotoUrl: null,
    infoPhotoUrl: null,
    batchesPhotoUrl: null,
    coachesPhotoUrl: null,
    achievementsPhotoUrl: null,
    themeColor: DEFAULT_WEBSITE_THEME,
  };
}

export function mapWebsiteResponse(
  body: Record<string, unknown>,
  fallbackName = '',
): PoolWebsiteContent {
  const batches = Array.isArray(body.batches)
    ? body.batches.map((item) => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          name: String(row.name ?? '').trim(),
          type: String(row.type ?? '').trim(),
          startTime: String(row.startTime ?? '').slice(0, 5),
          endTime: String(row.endTime ?? '').slice(0, 5),
        };
      }).filter((row) => row.name)
    : [];
  const coaches = Array.isArray(body.coaches)
    ? body.coaches.map((item) => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          name: String(row.name ?? '').trim(),
          role: String(row.role ?? '').trim() || 'Coach',
        };
      }).filter((row) => row.name)
    : [];
  return {
    poolName: String(body.poolName ?? '').trim() || fallbackName,
    poolAddress: String(body.poolAddress ?? '').trim(),
    poolLogoUrl: body.poolLogoUrl ? String(body.poolLogoUrl) : null,
    about: String(body.about ?? ''),
    history: String(body.history ?? ''),
    openingHours: String(body.openingHours ?? ''),
    facilities: String(body.facilities ?? ''),
    batchesText: String(body.batchesText ?? ''),
    coachesText: String(body.coachesText ?? ''),
    achievements: parseAchievements(body.achievements),
    batches,
    coaches,
    bannerPhotoUrl: asPhotoUrl(body.bannerPhotoUrl),
    historyPhotoUrl: asPhotoUrl(body.historyPhotoUrl),
    infoPhotoUrl: asPhotoUrl(body.infoPhotoUrl),
    batchesPhotoUrl: asPhotoUrl(body.batchesPhotoUrl),
    coachesPhotoUrl: asPhotoUrl(body.coachesPhotoUrl),
    achievementsPhotoUrl: asPhotoUrl(body.achievementsPhotoUrl),
    themeColor: parseThemeColor(body.themeColor),
  };
}

function asPhotoUrl(value: unknown) {
  const url = String(value ?? '').trim();
  return url || null;
}

export function parseAchievements(raw: unknown): PoolWebsiteAchievement[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        title: String(row.title ?? '').trim(),
        detail: String(row.detail ?? '').trim(),
      };
    })
    .filter((row) => row.title || row.detail);
}

export function withWebsiteSamples(
  content: PoolWebsiteContent,
  poolName: string,
): PoolWebsiteContent {
  const name = poolName.trim() || content.poolName.trim() || 'this swimming pool';
  return {
    ...content,
    poolName: content.poolName.trim() || name,
    about:
      content.about.trim() ||
      `${name} offers learn-to-swim, lane sessions, and coaching for every level. This is a sample website — staff can log in from the top right.`,
    history:
      (content.history ?? '').trim() ||
      `${name} started as a neighbourhood swimming programme and grew into a full training pool for beginners, fitness swimmers, and competitive athletes.\n\nDaily coaching, timed batches, and water-safety habits are at the centre of how the deck is run. Families have trained here for years — from first strokes to school, district, and state meets.\n\nLadies’ sessions, mixed lane practice, and evening competitive groups share the same facility. Timings, hygiene, and coaching standards are kept consistent through the week.`,
    openingHours: content.openingHours.trim() || '6:00 AM – 9:00 PM',
    facilities:
      content.facilities.trim() ||
      'Swimming lessons, lane sessions, and coaching for every level.',
    batchesText:
      content.batchesText.trim() ||
      'Morning and evening batches for mixed, ladies, and competitive groups.',
    coachesText:
      content.coachesText.trim() ||
      'Our coaches run daily batches and help swimmers progress from beginners to competition.',
    achievements:
      content.achievements.length > 0 ? content.achievements : SAMPLE_WEBSITE_ACHIEVEMENTS,
    batches: content.batches.length > 0 ? content.batches : SAMPLE_WEBSITE_BATCHES,
    coaches: content.coaches.length > 0 ? content.coaches : SAMPLE_WEBSITE_COACHES,
    themeColor: parseThemeColor(content.themeColor),
  };
}
