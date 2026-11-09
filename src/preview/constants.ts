/** Matches `roundedRectExtra` in src/vsdx/geometry.ts (~8 px minimum radius). */
export const ROUNDED_RECT_ARC_SIZE_PCT = 12;
export const ROUNDED_RECT_MIN_RADIUS_PX = 8;

export function roundedRectRadiusPx(width: number, height: number): number {
  const minSide = Math.min(width, height);
  return Math.max(ROUNDED_RECT_MIN_RADIUS_PX, (minSide * ROUNDED_RECT_ARC_SIZE_PCT) / 100);
}

export const FONT_FAMILY = "Noto Sans SC, sans-serif";
export const FONT_FAMILY_CJK = "Noto Sans SC, sans-serif";
export const RESVG_DEFAULT_FONT_FAMILY = "Noto Sans SC";

export const DEFAULT_STROKE = "#222222";
export const DEFAULT_FILL = "#ffffff";

/** Visio swimlane left title: TxtAngle in src/vsdx/text.ts (≈ −90°). */
export const SWIMLANE_LEFT_TEXT_ROTATE_DEG = -90;
