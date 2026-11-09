import { TEXT_WIDTH_SAFETY, textBlockHeightPx } from "../geometry/text-area.js";
import { measureTextWidthPx, wrapTextLines } from "../preview/font-metrics.js";
import type { NodeShape } from "../schema.js";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Size {
  width: number;
  height: number;
}

/** Widest line of a label (labels may contain \n). */
export function labelWidthPx(label: string, fontPx: number, bold = false): number {
  return Math.max(
    0,
    ...label.split("\n").map((line) => measureTextWidthPx(line.trim(), fontPx, bold)),
  );
}

function linesAt(label: string, width: number, fontPx: number, bold: boolean): number {
  return wrapTextLines(label, width * TEXT_WIDTH_SAFETY, fontPx, bold, { breakLongWords: true })
    .length;
}

function textHeight(label: string, width: number, fontPx: number, bold: boolean): number {
  return textBlockHeightPx(linesAt(label, width, fontPx, bold), fontPx);
}

/**
 * Size a shape so its label fits inside the shape's text area (the same area
 * the Visio writer and the preview use). Widths stay in a narrow band so
 * layered columns line up.
 */
export function measureShape(shape: NodeShape, label: string, fontPx: number, bold: boolean): Size {
  const text = label.trim();
  const tw = text ? labelWidthPx(text, fontPx, bold) : 0;
  const scale = fontPx / 13;

  switch (shape) {
    case "diamond": {
      // the text area of a rhombus is ~62% × 58% of its box
      for (const w of [120, 140, 160, 180, 200, 220].map((v) => v * scale)) {
        const h = Math.max(w * 0.68, textHeight(text, w * 0.62, fontPx, bold) / 0.58 + 8);
        if (h <= w * 0.9 || w >= 220 * scale)
          return { width: Math.round(w), height: Math.round(h) };
      }
      return { width: 220, height: 160 };
    }
    case "ellipse":
    case "circle": {
      const w = clamp(tw / 0.76 + 28, 100 * scale, 240 * scale);
      const h = Math.max(56 * scale, textHeight(text, w * 0.76, fontPx, bold) / 0.7 + 8);
      if (shape === "circle") {
        const d = Math.round(Math.max(w * 0.8, h, 72 * scale));
        return { width: d, height: d };
      }
      return { width: Math.round(w), height: Math.round(h) };
    }
    case "hexagon": {
      const w = clamp(tw / 0.66 + 24, 130 * scale, 260 * scale);
      const h = Math.max(60 * scale, textHeight(text, w * 0.66, fontPx, bold) / 0.8 + 8);
      return { width: Math.round(w), height: Math.round(h) };
    }
    case "cylinder": {
      const w = clamp(tw / 0.88 + 24, 100 * scale, 200 * scale);
      const h = Math.max(80 * scale, textHeight(text, w * 0.88, fontPx, bold) / 0.62 + 12);
      return { width: Math.round(w), height: Math.round(h) };
    }
    case "text": {
      const w = clamp(tw + 12, 40, 320 * scale);
      const h = textHeight(text, w - 4, fontPx, bold) + 8;
      return { width: Math.round(w), height: Math.round(h) };
    }
    case "actor":
      return { width: Math.round(40 * scale), height: Math.round(72 * scale) };
    case "image":
      return { width: 96, height: 96 };
    default: {
      // rect, roundedRect, note
      const w = clamp(tw + 36, 120 * scale, 240 * scale);
      const h = Math.max(54 * scale, textHeight(text, w - 16, fontPx, bold) + 24);
      return { width: Math.round(w), height: Math.round(h) };
    }
  }
}

/** Caption under a pictogram (actor, image). */
export function measureCaption(label: string, fontPx: number, minWidth: number): Size {
  const tw = labelWidthPx(label.trim(), fontPx);
  const w = clamp(tw + 8, minWidth, 200);
  return { width: Math.round(w), height: Math.round(textHeight(label, w - 4, fontPx, false) + 4) };
}

/** Width/height a label needs when placed on a connector. */
export function measureEdgeLabel(label: string, fontPx: number): Size {
  return {
    width: Math.ceil(labelWidthPx(label, fontPx)) + 10,
    height: Math.ceil(textBlockHeightPx(label.split("\n").length, fontPx)) + 4,
  };
}
