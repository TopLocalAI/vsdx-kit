import type { PlacedNode } from "../types.js";

export interface TextArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Line pitch used by preview tspans and Visio paragraph spacing (SpLine). */
export const TEXT_LINE_PITCH = 1.25;
/** Height of a single text line (glyph extent incl. descenders). */
export const TEXT_FIRST_LINE = 1.2;
/** Fit lines to this share of the area width (covers Visio font differences). */
export const TEXT_WIDTH_SAFETY = 0.95;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Node has no visible frame: drawn as bare text. */
export function isBareTextNode(node: PlacedNode): boolean {
  if (node.kind === "text") return true;
  const fillNone = node.style?.fill === "none";
  const strokeNone = node.style?.stroke === "none";
  return fillNone && strokeNone;
}

export function isImageNode(node: PlacedNode): boolean {
  return node.kind === "image" || (node.kind === "placeholder" && node.placeholderOf === "image");
}

/**
 * Usable text block of a node in page px (same box for preview, fitting and
 * Visio TxtPin/TxtWidth/TxtHeight). Null when the node carries no text.
 */
export function nodeTextArea(node: PlacedNode): TextArea | null {
  const area = baseTextArea(node);
  if (!area || !node.textBand) return area;
  const top = Math.max(area.y, node.y + node.textBand.top);
  const bottom = Math.min(area.y + area.height, node.y + node.textBand.bottom);
  if (bottom - top < 4) return area;
  const b = node.textBand;
  const left = b.left !== undefined ? Math.max(area.x, node.x + b.left) : area.x;
  const right =
    b.right !== undefined ? Math.min(area.x + area.width, node.x + b.right) : area.x + area.width;
  if (right - left < 8) return { ...area, y: top, height: bottom - top };
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function baseTextArea(node: PlacedNode): TextArea | null {
  const { x, y, width: w, height: h } = node;
  if (isImageNode(node)) return null;
  if (node.kind === "swimlane" && (node.headerSide ?? "top") === "left") return null;
  if (node.kind === "container" || node.kind === "swimlane") {
    const band = clamp(node.headerSize ?? 40, 12, Math.max(12, h));
    return { x: x + 12, y: y + 2, width: Math.max(8, w - 24), height: Math.max(8, band - 4) };
  }
  if (isBareTextNode(node)) {
    const pad = Math.min(2, w * 0.02);
    return { x: x + pad, y, width: Math.max(1, w - pad * 2), height: h };
  }
  const centered = (fw: number, fh: number, dy = 0): TextArea => ({
    x: x + (w - w * fw) / 2,
    y: y + (h - h * fh) / 2 + dy * h,
    width: w * fw,
    height: h * fh,
  });
  switch (node.kind) {
    case "diamond":
      return centered(0.62, 0.58);
    case "hexagon":
      return centered(0.66, 0.8);
    case "ellipse":
      return centered(0.76, 0.7);
    case "cylinder":
      return centered(0.88, 0.62, 0.06);
    default: {
      const padX = clamp(Math.min(w, h) * 0.08, 2, 8);
      const padY = clamp(h * 0.08, 1, 6);
      return {
        x: x + padX,
        y: y + padY,
        width: Math.max(1, w - padX * 2),
        height: Math.max(1, h - padY * 2),
      };
    }
  }
}

/** Height of a block of `lines` at fontPx (used for fitting and overflow checks). */
export function textBlockHeightPx(lines: number, fontPx: number): number {
  if (lines <= 0) return 0;
  return fontPx * TEXT_FIRST_LINE + (lines - 1) * fontPx * TEXT_LINE_PITCH;
}

/** Height of lines with individual font sizes (title + subtitle runs). */
export function mixedBlockHeightPx(sizes: number[]): number {
  if (!sizes.length) return 0;
  return sizes[0]! * TEXT_FIRST_LINE + sizes.slice(1).reduce((s, f) => s + f * TEXT_LINE_PITCH, 0);
}
