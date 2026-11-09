import type { PlacedDiagram, Style } from "../types.js";
import { FONT_FAMILY, FONT_FAMILY_CJK } from "./constants.js";
import { svgNeedsCjk } from "./font-cache.js";
import { measureTextWidthPx, wrapTextLines } from "./font-metrics.js";
import { escapeSvgText, n } from "./svg-util.js";

export { measureTextWidthPx as estimateTextWidthPx };

/** Line spacing multiplier (matches SVG tspans and vertical centering). */
export const TEXT_LINE_HEIGHT_RATIO = 1.25;

let activeFontFamily = FONT_FAMILY;

export function setActiveFontFamily(cjk: boolean): void {
  activeFontFamily = cjk ? FONT_FAMILY_CJK : FONT_FAMILY;
}

export function diagramNeedsCjk(diagram: PlacedDiagram): boolean {
  const chunks: string[] = [];
  if (diagram.title) chunks.push(diagram.title);
  for (const node of diagram.nodes) {
    if (node.label) chunks.push(node.label);
    if (node.placeholderOf) chunks.push(node.placeholderOf);
  }
  for (const edge of diagram.edges) {
    if (edge.label) chunks.push(edge.label);
  }
  return svgNeedsCjk(chunks.join("\n"));
}

/** Horizontal inset inside shape text block (matches layout box padding). */
export function textWrapWidthPx(boxWidth: number, fontPx: number): number {
  return Math.max(fontPx * 2, boxWidth - 28);
}

export function wrapText(
  text: string,
  maxWidthPx: number,
  fontPx: number,
  style?: Style,
): string[] {
  return wrapTextLines(text, maxWidthPx, fontPx, style?.bold);
}

export function textStyleAttrs(style?: Style): string {
  const fontSize = style?.fontSize ?? 12;
  const color = style?.fontColor ?? "#111111";
  const weight = style?.bold ? "700" : "400";
  const fontStyle = style?.italic ? "italic" : "normal";
  return `font-family="${activeFontFamily}" font-size="${fontSize}" fill="${color}" font-weight="${weight}" font-style="${fontStyle}"`;
}

export function textAnchor(style?: Style): "start" | "middle" | "end" {
  switch (style?.align) {
    case "left":
      return "start";
    case "right":
      return "end";
    default:
      return "middle";
  }
}

export function verticalTextStartY(
  boxY: number,
  boxH: number,
  lineCount: number,
  fontPx: number,
  style?: Style,
): number {
  const lineHeight = fontPx * TEXT_LINE_HEIGHT_RATIO;
  const blockH = fontPx + Math.max(0, lineCount - 1) * lineHeight;
  switch (style?.verticalAlign) {
    case "top":
      return boxY + fontPx;
    case "bottom":
      return boxY + boxH - blockH + fontPx;
    default:
      return boxY + (boxH - blockH) / 2 + fontPx;
  }
}

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Visio text block inset (textPinCells: 0.867 × 0.714 of shape). */
export function shapeTextBox(x: number, y: number, w: number, h: number): TextBox {
  const tw = w * 0.867;
  const th = h * 0.714;
  return {
    x: x + (w - tw) / 2,
    y: y + (h - th) / 2,
    width: tw,
    height: th,
  };
}

export function renderTextInBox(label: string, box: TextBox, style?: Style): string {
  const fontPx = style?.fontSize ?? 12;
  const wrapW = textWrapWidthPx(box.width, fontPx);
  const lines = wrapText(label, wrapW, fontPx, style);
  return renderTextLines(lines, box, style);
}

export function renderTextLines(lines: string[], box: TextBox, style?: Style): string {
  const fontPx = style?.fontSize ?? 12;
  const anchor = textAnchor(style);
  const anchorX =
    anchor === "start" ? box.x : anchor === "end" ? box.x + box.width : box.x + box.width / 2;
  const lineHeight = fontPx * TEXT_LINE_HEIGHT_RATIO;
  const startY = verticalTextStartY(box.y, box.height, lines.length, fontPx, style);
  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<tspan x="${n(anchorX)}" y="${n(y)}">${escapeSvgText(line)}</tspan>`;
    })
    .join("");
  return `<text ${textStyleAttrs(style)} text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text>`;
}
