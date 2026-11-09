import type { Style, SubLabel } from "../types.js";
import type { ShapeBox } from "./units.js";
import { inch, pxToInX } from "./units.js";
import { escapeXml } from "./xml.js";

const DEFAULT_FONT = "Microsoft YaHei";
const SWIMLANE_LEFT_TXT_ANGLE = 7.853981633974483;

/** Visio Character Size in inches for a font size in px (≈ px / 104.742, as draw.io exports it). */
export function visioFontSize(fontSizePx = 12): number {
  return inch(fontSizePx / 104.742);
}

/** Edge labels default to 11px. */
export function visioEdgeLabelFontSize(fontSizePx?: number): number {
  return visioFontSize(fontSizePx ?? 11);
}

export function textUnits(value: string): number {
  let units = 0;
  for (const character of value) {
    units += character.charCodeAt(0) > 0x2e80 ? 2 : 1;
  }
  return units;
}

export function textWidthPx(value: string, fontPx = 13): number {
  return textUnits(value) * fontPx * 0.55;
}

import { connectorLabelHeightPx, connectorLabelWidthIn } from "../geometry/connector-label.js";

export { connectorLabelWidthIn } from "../geometry/connector-label.js";

export function horzAlign(style?: Style): string {
  switch (style?.align) {
    case "left":
      return "0";
    case "right":
      return "2";
    default:
      return "1";
  }
}

export function vertAlign(style?: Style): string {
  switch (style?.verticalAlign) {
    case "top":
      return "0";
    case "bottom":
      return "2";
    default:
      return "1";
  }
}

/**
 * Character rows: IX 0 = the label run, IX 1 = the secondary (subtitle) run
 * (same as the label unless `sub` is given).
 */
export function charStyle(style?: Style, sub?: SubLabel): string {
  const size = visioFontSize(style?.fontSize ?? 12);
  const color = style?.fontColor ?? "#111111";
  let visioStyle = 0;
  if (style?.bold) visioStyle |= 1;
  if (style?.italic) visioStyle |= 2;
  const subSize = sub ? visioFontSize(sub.fontSize ?? (style?.fontSize ?? 12) * 0.8) : size;
  const subColor = sub?.fontColor ?? color;
  const subStyle = sub?.bold ? 1 : 0;
  const row = `<Row IX="0"><Cell N="Color" V="${color}"/><Cell N="Size" V="${size}"/><Cell N="Font" V="${DEFAULT_FONT}"/><Cell N="AsianFont" V="${DEFAULT_FONT}"/><Cell N="Style" V="${visioStyle}"/><Cell N="Case" V="0"/><Cell N="Pos" V="0"/><Cell N="FontScale" V="1"/><Cell N="Letterspace" V="0"/></Row><Row IX="1"><Cell N="Color" V="${subColor}"/><Cell N="Size" V="${subSize}"/><Cell N="Font" V="${DEFAULT_FONT}"/><Cell N="AsianFont" V="${DEFAULT_FONT}"/><Cell N="Style" V="${subStyle}"/><Cell N="Case" V="0"/><Cell N="Pos" V="0"/><Cell N="FontScale" V="1"/><Cell N="Letterspace" V="0"/></Row>`;
  return `<Section N="Character">${row}</Section><Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="${horzAlign(style)}"/><Cell N="SpLine" V="-1.25"/><Cell N="SpBefore" V="0"/><Cell N="SpAfter" V="0"/></Row></Section>`;
}

export function textPinCells(box: ShapeBox): string {
  const txtW = inch(box.width * 0.867);
  const txtH = inch(box.height * 0.714);
  const txtLocX = inch(txtW / 2);
  const txtLocY = inch(txtH / 2);
  return `<Cell N="TxtPinX" V="${box.locPinX}"/><Cell N="TxtPinY" V="${box.locPinY}"/><Cell N="TxtWidth" V="${txtW}"/><Cell N="TxtHeight" V="${txtH}"/><Cell N="TxtLocPinX" V="${txtLocX}"/><Cell N="TxtLocPinY" V="${txtLocY}"/>`;
}

/** Group / container title band (draw.io spacingLeft=12, spacingTop=4). */
export function containerTextPinCells(box: ShapeBox): string {
  const padL = pxToInX(12);
  const padT = pxToInX(4);
  const txtW = inch(Math.max(box.width - padL * 2, box.width * 0.5));
  const txtH = pxToInX(40);
  const pinX = inch(padL + txtW / 2);
  const pinY = inch(padT + txtH / 2);
  const txtLocX = inch(0);
  const txtLocY = inch(txtH / 2);
  return `<Cell N="TxtPinX" V="${pinX}"/><Cell N="TxtPinY" V="${pinY}"/><Cell N="TxtWidth" V="${txtW}"/><Cell N="TxtHeight" V="${txtH}"/><Cell N="TxtLocPinX" V="${txtLocX}"/><Cell N="TxtLocPinY" V="${txtLocY}"/>`;
}

export function swimlaneLeftTextPinCells(box: ShapeBox, headerWidthIn: number): string {
  const txtW = inch(headerWidthIn * 0.95);
  const txtH = inch(box.height * 0.92);
  const pinX = inch(headerWidthIn / 2);
  const pinY = inch(box.height / 2);
  const txtLocX = inch(txtW / 2);
  const txtLocY = inch(txtH / 2);
  return `<Cell N="TxtPinX" V="${pinX}"/><Cell N="TxtPinY" V="${pinY}"/><Cell N="TxtWidth" V="${txtW}"/><Cell N="TxtHeight" V="${txtH}"/><Cell N="TxtLocPinX" V="${txtLocX}"/><Cell N="TxtLocPinY" V="${txtLocY}"/><Cell N="TxtAngle" V="${SWIMLANE_LEFT_TXT_ANGLE}"/>`;
}

/** Visio text: one paragraph per line (newline = paragraph break). */
export function textBlock(
  label: string | undefined,
  _style?: Style,
  lines?: string[],
  subLines?: string[],
): string {
  if (!label) return "";
  const body = (lines ?? label.split("\n")).map((line) => escapeXml(line)).join("\n");
  const sub = subLines?.length
    ? `\n<cp IX="1"/>${subLines.map((line) => escapeXml(line)).join("\n")}`
    : "";
  return `<Text><cp IX="0"/><pp IX="0"/>${body}${sub}</Text>`;
}

/** Text block cells for a page-px text area inside a node (Visio local coords, y up). */
export function textAreaPinCells(
  node: { x: number; y: number; width: number; height: number },
  area: { x: number; y: number; width: number; height: number },
  style?: Style,
): string {
  const txtW = pxToInX(area.width);
  const txtH = pxToInX(area.height);
  const pinX = pxToInX(area.x + area.width / 2 - node.x);
  const pinY = pxToInX(node.y + node.height - (area.y + area.height / 2));
  return `<Cell N="TxtPinX" V="${pinX}"/><Cell N="TxtPinY" V="${pinY}"/><Cell N="TxtWidth" V="${txtW}"/><Cell N="TxtHeight" V="${txtH}"/><Cell N="TxtLocPinX" V="${inch(txtW / 2)}"/><Cell N="TxtLocPinY" V="${inch(txtH / 2)}"/><Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/><Cell N="VerticalAlign" V="${vertAlign(style)}"/>`;
}

export function connectorLabelCells(
  localMid: { x: number; y: number },
  label: string,
  style?: Style,
  angleDeg?: number,
): string {
  const fontPx = style?.fontSize ?? 11;
  const txtW = connectorLabelWidthIn(label, fontPx);
  const txtH = pxToInX(connectorLabelHeightPx(fontPx));
  const txtLocX = inch(txtW / 2);
  const txtLocY = inch(txtH / 2);
  const labelStyle: Style = { ...style, fontSize: fontPx };
  return `<Cell N="TxtPinX" V="${localMid.x}"/><Cell N="TxtPinY" V="${localMid.y}"/><Cell N="TxtWidth" V="${txtW}"/><Cell N="TxtHeight" V="${txtH}"/><Cell N="TxtLocPinX" V="${txtLocX}"/><Cell N="TxtLocPinY" V="${txtLocY}"/>${txtAngleCell(angleDeg)}${charStyle(labelStyle)}${textBlock(label, labelStyle)}`;
}

/**
 * Visio TxtAngle (radians, counter-clockwise, page y up) for a label rotated
 * `angleDeg` clockwise on the y-down page.
 */
export function txtAngleCell(angleDeg?: number): string {
  if (!angleDeg) return "";
  return `<Cell N="TxtAngle" V="${inch((-angleDeg * Math.PI) / 180)}"/>`;
}

export function linePattern(dashed?: boolean): string {
  return dashed ? `<Cell N="LinePattern" V="2"/>` : "";
}

export function fillOpacity(opacity?: number): string {
  if (opacity === undefined || opacity >= 100) return "";
  const trans = Math.round((1 - opacity / 100) * 100) / 100;
  return `<Cell N="FillForegndTrans" V="${trans}"/>`;
}

export function strokeWeightFromPx(strokeWidth?: number): string {
  if (!strokeWidth) return "";
  return `<Cell N="LineWeight" V="${pxToInX(strokeWidth)}"/>`;
}
