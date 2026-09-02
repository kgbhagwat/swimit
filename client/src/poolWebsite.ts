import type { CSSProperties } from 'react';

export const LAYOUT_RECT_MIN = 6;
/** Logical gap used when migrating/rounding rects (percent of canvas). Visual gap uses CSS `--pool-box-gap`. */
export const LAYOUT_BOX_GAP = 0.8;

export type LayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
};

export type PoolWebsiteCustomBox = {
  id: string;
  title: string;
  body: string;
  rect: LayoutRect;
  photoUrl: string | null;
};

export type PoolWebsiteLayout = {
  banner: LayoutRect;
  story: LayoutRect;
  intro: LayoutRect;
  batches: LayoutRect;
  coaches: LayoutRect;
  achievements: LayoutRect;
  customBoxes: PoolWebsiteCustomBox[];
};

export type WebsiteLayoutSectionKey =
  | 'banner'
  | 'story'
  | 'intro'
  | 'batches'
  | 'coaches'
  | 'achievements';

export type LayoutRectEdge = 'top' | 'bottom' | 'left' | 'right';

export const WEBSITE_LAYOUT_SECTIONS: WebsiteLayoutSectionKey[] = [
  'banner',
  'story',
  'intro',
  'batches',
  'coaches',
  'achievements',
];

export function isLayoutRectVisible(rect: LayoutRect): boolean {
  return rect.hidden !== true;
}

export function customBoxHasContent(box: Pick<PoolWebsiteCustomBox, 'title' | 'body' | 'photoUrl'>): boolean {
  return Boolean(box.title.trim() || box.body.trim() || box.photoUrl);
}

export function sanitizeWebsiteLayout(layout: PoolWebsiteLayout): PoolWebsiteLayout {
  return {
    ...layout,
    customBoxes: layout.customBoxes.filter((box) => customBoxHasContent(box) && isLayoutRectVisible(box.rect)),
  };
}

export function cloneWebsiteLayout(layout: PoolWebsiteLayout): PoolWebsiteLayout {
  return JSON.parse(JSON.stringify(layout)) as PoolWebsiteLayout;
}

export function hideLayoutRect(rect: LayoutRect): LayoutRect {
  return { ...rect, hidden: true };
}

export function showLayoutRect(rect: LayoutRect): LayoutRect {
  const next = { ...rect };
  delete next.hidden;
  return next;
}

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
  photoUrl?: string | null;
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
  achievementsPhotoUrl: string | null;
  themeColor: string;
  showCoachPhotos: boolean;
  layout: PoolWebsiteLayout;
};

export function defaultWebsiteLayout(): PoolWebsiteLayout {
  const introH = 14;
  const colY = introH;
  const colH = 100 - introH;
  const colW = 50 / 3;
  return {
    banner: { x: 0, y: 0, w: 50, h: 50 },
    story: { x: 0, y: 50, w: 50, h: 50 },
    intro: { x: 50, y: 0, w: 50, h: introH },
    batches: { x: 50, y: colY, w: colW, h: colH },
    coaches: { x: 50 + colW, y: colY, w: colW, h: colH },
    achievements: { x: 50 + colW * 2, y: colY, w: colW, h: colH },
    customBoxes: [],
  };
}

export function isLayoutCustomized(layout: PoolWebsiteLayout): boolean {
  const defaults = defaultWebsiteLayout();
  if (sanitizeWebsiteLayout(layout).customBoxes.length > 0) return true;
  for (const key of WEBSITE_LAYOUT_SECTIONS) {
    if (!isLayoutRectVisible(layout[key])) return true;
    if (!rectsEqual(layout[key], defaults[key])) return true;
  }
  return false;
}

function isLegacyDefaultLayout(layout: PoolWebsiteLayout): boolean {
  if (sanitizeWebsiteLayout(layout).customBoxes.length > 0) return false;
  for (const key of WEBSITE_LAYOUT_SECTIONS) {
    if (!isLayoutRectVisible(layout[key])) return false;
  }
  return layout.batches.h === 52 && layout.coaches.h === 52 && layout.achievements.h === 86;
}

function matchesStandardLayoutPattern(layout: PoolWebsiteLayout): boolean {
  if (sanitizeWebsiteLayout(layout).customBoxes.length > 0) return false;
  for (const key of WEBSITE_LAYOUT_SECTIONS) {
    if (!isLayoutRectVisible(layout[key])) return false;
  }
  const colW = 50 / 3;
  const near = (value: number, target: number, tolerance = 1) => Math.abs(value - target) <= tolerance;
  if (!near(layout.banner.w, 50) || !near(layout.story.w, 50)) return false;
  if (!near(layout.banner.h, 50) || !near(layout.story.y, 50)) return false;
  if (!near(layout.intro.x, 50) || !near(layout.intro.h, 14)) return false;
  if (!near(layout.batches.y, 14) || !near(layout.batches.h, 86)) return false;
  if (!near(layout.batches.w, colW, 0.6)) return false;
  if (!near(layout.coaches.x, 50 + colW, 0.6)) return false;
  if (!near(layout.achievements.x, 50 + colW * 2, 0.6)) return false;
  return true;
}

export function resolvePublicWebsiteLayout(layout: PoolWebsiteLayout): PoolWebsiteLayout {
  const cleaned = sanitizeWebsiteLayout(layout);
  if (
    isLegacyDefaultLayout(cleaned) ||
    matchesStandardLayoutPattern(cleaned) ||
    !isLayoutCustomized(cleaned)
  ) {
    return defaultWebsiteLayout();
  }
  return cleaned;
}

export function defaultCustomBoxRect(index: number): LayoutRect {
  const introH = 14;
  const colH = 100 - introH;
  const customH = 24;
  const y = introH + colH - customH - index * 2;
  return clampLayoutRect({ x: 50, y: Math.max(introH + 4, y), w: 50, h: customH });
}

function roundRect(n: number) {
  return Math.round(n * 10) / 10;
}

export function clampLayoutRect(rect: LayoutRect): LayoutRect {
  const w = Math.max(LAYOUT_RECT_MIN, Math.min(100, rect.w));
  const h = Math.max(LAYOUT_RECT_MIN, Math.min(100, rect.h));
  const x = Math.max(0, Math.min(100 - w, rect.x));
  const y = Math.max(0, Math.min(100 - h, rect.y));
  const next: LayoutRect = { x: roundRect(x), y: roundRect(y), w: roundRect(w), h: roundRect(h) };
  if (rect.hidden) next.hidden = true;
  return next;
}

export function parseLayoutRect(raw: unknown, fallback: LayoutRect): LayoutRect {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return clampLayoutRect({
    x: Number(row.x ?? fallback.x),
    y: Number(row.y ?? fallback.y),
    w: Number(row.w ?? fallback.w),
    h: Number(row.h ?? fallback.h),
    hidden: row.hidden === true ? true : fallback.hidden,
  });
}

export function introCellRect(
  layout: PoolWebsiteLayout,
  column: 'batches' | 'coaches' | 'achievements',
): LayoutRect {
  const col = layout[column];
  return {
    x: col.x,
    y: layout.intro.y,
    w: col.w,
    h: layout.intro.h,
  };
}

/** Raw layout percents — edge handles add the visual gap via CSS calc. */
export function layoutRectCss(rect: LayoutRect) {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
  };
}

/**
 * Absolute box style with a fixed CSS gap (`--pool-box-gap`) so horizontal and
 * vertical gutters match in pixels on every webpage (not %-of-width vs %-of-height).
 */
export function rectStyle(rect: LayoutRect): CSSProperties {
  return {
    position: 'absolute',
    left: `calc(${rect.x}% + (var(--pool-box-gap) / 2))`,
    top: `calc(${rect.y}% + (var(--pool-box-gap) / 2))`,
    width: `calc(${rect.w}% - var(--pool-box-gap))`,
    height: `calc(${rect.h}% - var(--pool-box-gap))`,
    boxSizing: 'border-box',
  };
}

export function resizeLayoutRect(
  rect: LayoutRect,
  edge: LayoutRectEdge,
  deltaXPct: number,
  deltaYPct: number,
): LayoutRect {
  let { x, y, w, h } = rect;
  if (edge === 'left') {
    x += deltaXPct;
    w -= deltaXPct;
  } else if (edge === 'right') {
    w += deltaXPct;
  } else if (edge === 'top') {
    y += deltaYPct;
    h -= deltaYPct;
  } else if (edge === 'bottom') {
    h += deltaYPct;
  }
  return clampLayoutRect({ x, y, w, h, hidden: rect.hidden });
}

function parseCustomBoxPhotoUrl(box: Record<string, unknown>): string | null {
  const url = String(box.photoUrl ?? '').trim();
  if (url && !url.startsWith('blob:')) {
    if (url.startsWith('/uploads/') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('uploads/')) return `/${url}`;
    return url;
  }
  const path = String(box.photoPath ?? '').trim();
  if (!path) return null;
  if (path.startsWith('/uploads/')) return path;
  if (path.startsWith('uploads/')) return `/${path}`;
  return `/uploads/${path.replace(/^\/+/, '')}`;
}

function parseCustomBoxes(raw: unknown): PoolWebsiteCustomBox[] {
  const customRaw = Array.isArray(raw) ? raw : [];
  return customRaw
    .slice(0, 8)
    .map((item, index) => {
      const box = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const title = String(box.title ?? '').trim().slice(0, 120);
      const body = String(box.body ?? '').trim().slice(0, 2000);
      const photoUrl = parseCustomBoxPhotoUrl(box);
      if (!title && !body && !photoUrl) return null;
      const id = String(box.id ?? '').trim() || `custom-${index + 1}`;
      const fallback = defaultCustomBoxRect(index);
      let rect = parseLayoutRect(box.rect, fallback);
      if (!box.rect && (box.widthFr != null || box.colFr != null)) {
        const widthPct = Number(box.widthFr ?? box.colFr ?? 100);
        rect = clampLayoutRect({ ...fallback, w: (widthPct / 100) * 33.34 });
      }
      return { id, title, body, rect, photoUrl: photoUrl ?? null };
    })
    .filter((box): box is PoolWebsiteCustomBox => box !== null);
}

function migrateFrLayout(row: Record<string, unknown>): PoolWebsiteLayout {
  const leftFr = Number(row.leftColFr ?? 100);
  const rightFr = Number(row.rightColFr ?? 100);
  const bannerFr = Number(row.bannerRowFr ?? 100);
  const storyFr = Number(row.storyRowFr ?? 100);
  const introFr = Number(row.introRowFr ?? 100);
  const columnsFr = Number(row.columnsRowFr ?? row.batchesRowFr ?? 100);
  const customFr = Number(row.customRowFr ?? 80);
  const customRaw = Array.isArray(row.customBoxes) ? row.customBoxes : [];
  const hasCustom = customRaw.length > 0;
  const boardTotal = introFr + columnsFr + (hasCustom ? customFr : 0);
  const leftW = (leftFr / (leftFr + rightFr)) * 100;
  const bannerH = (bannerFr / (bannerFr + storyFr)) * 100;
  const introH = (introFr / boardTotal) * 100;
  const colsH = (columnsFr / boardTotal) * 100;
  const customH = hasCustom ? (customFr / boardTotal) * 100 : 0;
  const bFr = Number(row.batchesColFr ?? 100);
  const cFr = Number(row.coachesColFr ?? 100);
  const panelTotal = bFr + cFr + Number(row.achievementsColFr ?? 100);
  const bW = (bFr / panelTotal) * (100 - leftW);
  const cW = (cFr / panelTotal) * (100 - leftW);
  const batchesPH = Number(row.batchesPanelFr ?? 100);
  const panelH = colsH * (batchesPH / 100);

  const layout: PoolWebsiteLayout = {
    banner: clampLayoutRect({ x: 0, y: 0, w: leftW, h: bannerH }),
    story: clampLayoutRect({ x: 0, y: bannerH, w: leftW, h: 100 - bannerH }),
    intro: clampLayoutRect({ x: leftW, y: 0, w: 100 - leftW, h: introH }),
    batches: clampLayoutRect({ x: leftW, y: introH, w: bW, h: hasCustom ? panelH : 100 - introH }),
    coaches: clampLayoutRect({ x: leftW + bW, y: introH, w: cW, h: hasCustom ? panelH : 100 - introH }),
    achievements: clampLayoutRect({
      x: leftW + bW + cW,
      y: introH,
      w: 100 - leftW - bW - cW,
      h: hasCustom ? 100 - introH - customH : 100 - introH,
    }),
    customBoxes: parseCustomBoxes(row.customBoxes),
  };

  if (hasCustom && layout.customBoxes.length > 0) {
    const customY = introH + colsH;
    layout.customBoxes = layout.customBoxes.map((box, i) => ({
      ...box,
      rect:
        Math.abs(box.rect.y - defaultCustomBoxRect(i).y) < 2
          ? clampLayoutRect({ x: leftW, y: customY, w: bW + cW, h: customH || 28 })
          : box.rect,
    }));
  }

  return layout;
}

function rectsEqual(a: LayoutRect, b: LayoutRect) {
  return (
    roundRect(a.x) === roundRect(b.x) &&
    roundRect(a.y) === roundRect(b.y) &&
    roundRect(a.w) === roundRect(b.w) &&
    roundRect(a.h) === roundRect(b.h) &&
    Boolean(a.hidden) === Boolean(b.hidden)
  );
}

export function parseWebsiteLayout(raw: unknown): PoolWebsiteLayout {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return defaultWebsiteLayout();
    }
  }
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const defaults = defaultWebsiteLayout();

  if (row.banner && typeof row.banner === 'object') {
    return sanitizeWebsiteLayout({
      banner: parseLayoutRect(row.banner, defaults.banner),
      story: parseLayoutRect(row.story, defaults.story),
      intro: parseLayoutRect(row.intro, defaults.intro),
      batches: parseLayoutRect(row.batches, defaults.batches),
      coaches: parseLayoutRect(row.coaches, defaults.coaches),
      achievements: parseLayoutRect(row.achievements, defaults.achievements),
      customBoxes: parseCustomBoxes(row.customBoxes),
    });
  }

  if (row.leftColFr != null || row.bannerRowFr != null) {
    return sanitizeWebsiteLayout(migrateFrLayout(row));
  }

  return sanitizeWebsiteLayout({ ...defaults, customBoxes: parseCustomBoxes(row.customBoxes) });
}

export { rectsEqual };

export const WEBSITE_PHOTO_KEYS = [
  'banner',
  'history',
  'info',
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
    '--pool-kicker': '#ffffff',
    '--pool-cta-hover': mix(color, { r: 255, g: 255, b: 255 }, 0.9),
    '--pool-banner-fill': mix(color, { r: 135, g: 206, b: 235 }, 0.35),
  } as CSSProperties;
}

/** Convert "HH:MM" / "HH:MM:SS" to "h:mm AM/PM" for public website display. */
export function formatTimeAmPm(value: string) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return String(value ?? '').trim();
  let hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return String(value ?? '').trim();
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

export function formatBatchTimeRange(startTime: string, endTime: string) {
  const start = formatTimeAmPm(startTime);
  const end = formatTimeAmPm(endTime);
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} – ${end}`;
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
    achievementsPhotoUrl: null,
    themeColor: DEFAULT_WEBSITE_THEME,
    showCoachPhotos: false,
    layout: defaultWebsiteLayout(),
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
        const photoUrl = asPhotoUrl(row.photoUrl);
        return {
          name: String(row.name ?? '').trim(),
          role: String(row.role ?? '').trim() || 'Coach',
          ...(photoUrl ? { photoUrl } : {}),
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
    achievementsPhotoUrl: asPhotoUrl(body.achievementsPhotoUrl),
    themeColor: parseThemeColor(body.themeColor),
    showCoachPhotos: body.showCoachPhotos === true || String(body.showCoachPhotos) === '1',
    layout: resolvePublicWebsiteLayout(parseWebsiteLayout(body.layoutConfig ?? body.layout)),
  };
}

function asPhotoUrl(value: unknown) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (url.startsWith('blob:')) return null;
  return url;
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
  options?: { useSamples?: boolean },
): PoolWebsiteContent {
  const useSamples = options?.useSamples ?? true;
  const name = poolName.trim() || content.poolName.trim() || 'this swimming pool';
  return {
    ...content,
    poolName: content.poolName.trim() || name,
    about:
      content.about.trim() ||
      (useSamples
        ? `${name} offers learn-to-swim, lane sessions, and coaching for every level. Update this welcome text to describe your pool.`
        : ''),
    history:
      (content.history ?? '').trim() ||
      (useSamples
        ? `${name} started as a neighbourhood swimming programme and grew into a full training pool for beginners, fitness swimmers, and competitive athletes.\n\nDaily coaching, timed batches, and water-safety habits are at the centre of how the deck is run. Families have trained here for years — from first strokes to school, district, and state meets.\n\nLadies’ sessions, mixed lane practice, and evening competitive groups share the same facility. Timings, hygiene, and coaching standards are kept consistent through the week.`
        : ''),
    openingHours: content.openingHours.trim() || (useSamples ? '6:00 AM – 9:00 PM' : ''),
    facilities:
      content.facilities.trim() ||
      (useSamples ? 'Swimming lessons, lane sessions, and coaching for every level.' : ''),
    batchesText:
      content.batchesText.trim() ||
      (useSamples ? 'Morning and evening batches for mixed, ladies, and competitive groups.' : ''),
    coachesText:
      content.coachesText.trim() ||
      (useSamples
        ? 'Our coaches run daily batches and help swimmers progress from beginners to competition.'
        : ''),
    achievements:
      content.achievements.length > 0
        ? content.achievements
        : useSamples
          ? SAMPLE_WEBSITE_ACHIEVEMENTS
          : [],
    batches: content.batches.length > 0 ? content.batches : useSamples ? SAMPLE_WEBSITE_BATCHES : [],
    coaches: content.coaches.length > 0 ? content.coaches : useSamples ? SAMPLE_WEBSITE_COACHES : [],
    themeColor: parseThemeColor(content.themeColor),
    layout: resolvePublicWebsiteLayout(content.layout),
  };
}

/** True once the pool has saved any website content beyond the default preview. */
export function poolWebsiteIsCustomized(content: PoolWebsiteContent): boolean {
  if (content.about.trim()) return true;
  if ((content.history ?? '').trim()) return true;
  if (content.openingHours.trim()) return true;
  if (content.facilities.trim()) return true;
  if (content.batchesText.trim()) return true;
  if (content.coachesText.trim()) return true;
  if (content.achievements.length > 0) return true;
  if (content.bannerPhotoUrl) return true;
  if (content.historyPhotoUrl) return true;
  if (content.infoPhotoUrl) return true;
  if (content.achievementsPhotoUrl) return true;
  if (content.showCoachPhotos) return true;
  if (parseThemeColor(content.themeColor) !== DEFAULT_WEBSITE_THEME) return true;
  if (content.batches.length > 0) return true;
  if (content.coaches.length > 0) return true;
  if (isLayoutCustomized(content.layout)) return true;
  return false;
}
