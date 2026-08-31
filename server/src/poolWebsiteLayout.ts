export type LayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
};

export type PoolWebsiteLayoutConfig = {
  banner: LayoutRect;
  story: LayoutRect;
  intro: LayoutRect;
  batches: LayoutRect;
  coaches: LayoutRect;
  achievements: LayoutRect;
  customBoxes: unknown[];
};

const WEBSITE_LAYOUT_SECTIONS = [
  'banner',
  'story',
  'intro',
  'batches',
  'coaches',
  'achievements',
] as const;

function roundRect(n: number) {
  return Math.round(n * 10) / 10;
}

function isLayoutRectVisible(rect: LayoutRect) {
  return rect.hidden !== true;
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

export function defaultWebsiteLayoutConfig(): PoolWebsiteLayoutConfig {
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

export function standardWebsiteLayoutJson() {
  return JSON.stringify(defaultWebsiteLayoutConfig());
}

function isLayoutCustomized(layout: PoolWebsiteLayoutConfig) {
  const defaults = defaultWebsiteLayoutConfig();
  if (Array.isArray(layout.customBoxes) && layout.customBoxes.length > 0) return true;
  for (const key of WEBSITE_LAYOUT_SECTIONS) {
    const rect = layout[key];
    if (!isLayoutRectVisible(rect)) return true;
    if (!rectsEqual(rect, defaults[key])) return true;
  }
  return false;
}

function isLegacyDefaultLayout(layout: PoolWebsiteLayoutConfig) {
  if (Array.isArray(layout.customBoxes) && layout.customBoxes.length > 0) return false;
  for (const key of WEBSITE_LAYOUT_SECTIONS) {
    if (!isLayoutRectVisible(layout[key])) return false;
  }
  return layout.batches.h === 52 && layout.coaches.h === 52 && layout.achievements.h === 86;
}

function matchesStandardLayoutPattern(layout: PoolWebsiteLayoutConfig) {
  if (Array.isArray(layout.customBoxes) && layout.customBoxes.length > 0) return false;
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

/** Canonical layout for new accounts and any pool that has not customized the grid. */
export function resolveWebsiteLayoutConfig<T extends PoolWebsiteLayoutConfig>(layout: T): T {
  if (
    isLegacyDefaultLayout(layout) ||
    matchesStandardLayoutPattern(layout) ||
    !isLayoutCustomized(layout)
  ) {
    return { ...defaultWebsiteLayoutConfig(), customBoxes: layout.customBoxes ?? [] } as T;
  }
  return layout;
}
