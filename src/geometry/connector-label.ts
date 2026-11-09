import { measureTextWidthPx } from "../preview/font-metrics.js";
import { pxToInX } from "../vsdx/units.js";

const LABEL_PAD_PX = 8;
const LABEL_HEIGHT_RATIO = 1.85;
const NO_WRAP_MAX_CHARS = 20;

/** Connector label box width in px (Noto Sans SC model + horizontal padding). */
export function connectorLabelWidthPx(label: string, fontPx: number, bold = false): number {
  const chars = [...label].length;
  if (chars <= NO_WRAP_MAX_CHARS) {
    return Math.max(fontPx * 2, measureTextWidthPx(label, fontPx, bold) + LABEL_PAD_PX * 2);
  }
  return Math.max(fontPx * 2, measureTextWidthPx(label, fontPx, bold) + LABEL_PAD_PX * 2);
}

export function connectorLabelHeightPx(fontPx: number): number {
  return fontPx * LABEL_HEIGHT_RATIO;
}

export function connectorLabelWidthIn(label: string, fontPx: number, bold = false): number {
  return pxToInX(connectorLabelWidthPx(label, fontPx, bold));
}

export function connectorLabelShouldWrap(label: string): boolean {
  return [...label].length > NO_WRAP_MAX_CHARS;
}

/** Box of an edge label (badge frame / background) centred on the anchor, page px. */
export function connectorLabelBoxPx(
  label: string,
  anchor: { x: number; y: number },
  fontPx: number,
  bold = false,
): { x: number; y: number; width: number; height: number } {
  const width = connectorLabelWidthPx(label, fontPx, bold);
  const height = connectorLabelHeightPx(fontPx);
  return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };
}

/** Corner radius of a rounded label badge (px). */
export function labelBadgeRadiusPx(height: number): number {
  return Math.min(6, height * 0.28);
}
