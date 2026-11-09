import {
  connectorLabelHeightPx,
  connectorLabelShouldWrap,
  connectorLabelWidthPx,
  labelBadgeRadiusPx,
} from "../geometry/connector-label.js";
import {
  isImageNode,
  mixedBlockHeightPx,
  nodeTextArea,
  TEXT_LINE_PITCH,
  TEXT_WIDTH_SAFETY,
  textBlockHeightPx,
} from "../geometry/text-area.js";
import { imageToDataUri } from "../image/data-uri.js";
import type { ArrowKind, LabelBox, PlacedNode, Style } from "../types.js";
import {
  DEFAULT_FILL,
  DEFAULT_STROKE,
  roundedRectRadiusPx,
  SWIMLANE_LEFT_TEXT_ROTATE_DEG,
} from "./constants.js";
import { wrapTextLines } from "./font-metrics.js";
import { escapeSvgText, n, relX, relY } from "./svg-util.js";
import {
  renderTextInBox,
  renderTextLines,
  TEXT_LINE_HEIGHT_RATIO,
  type TextBox,
  textAnchor,
  textStyleAttrs,
} from "./text-layout.js";

function strokeAttrs(style?: Style): string {
  if (style?.stroke === "none") return `stroke="none"`;
  const stroke = style?.stroke ? style.stroke : DEFAULT_STROKE;
  const sw = style?.strokeWidth ?? 1;
  const dash = style?.dashed ? ' stroke-dasharray="4 3"' : "";
  return `stroke="${stroke}" stroke-width="${n(sw)}"${dash}`;
}

function fillAttrs(style?: Style, defaultFill = DEFAULT_FILL): string {
  if (style?.fill === "none") {
    return `fill="none"`;
  }
  const fill = style?.fill ? style.fill : defaultFill;
  const opacity =
    style?.opacity !== undefined && style.opacity < 100
      ? ` fill-opacity="${n(style.opacity / 100)}"`
      : "";
  return `fill="${fill}"${opacity}`;
}

function isLabelOverlay(node: PlacedNode): boolean {
  return node.style?.fill === "none" && node.style?.stroke === "none";
}

function nodeLabel(node: PlacedNode): string {
  if (isImageNode(node)) return "";
  const label =
    node.kind === "placeholder" ? node.label || node.placeholderOf || "unsupported" : node.label;
  if (!label) return "";
  if (node.kind === "swimlane" && (node.headerSide ?? "top") === "left") {
    const headerW = node.headerSize ?? 30;
    const box: TextBox = {
      x: node.x,
      y: node.y,
      width: headerW * 0.95,
      height: node.height * 0.92,
    };
    const cx = node.x + headerW / 2;
    const cy = node.y + node.height / 2;
    const fontPx = node.style?.fontSize ?? 12;
    const lines = label.split("\n");
    const lineHeight = fontPx * TEXT_LINE_HEIGHT_RATIO;
    const anchorX = box.x + box.width / 2;
    const blockH = fontPx + Math.max(0, lines.length - 1) * lineHeight;
    const startY = box.y + (box.height - blockH) / 2 + fontPx;
    const tspans = lines
      .map((line, i) => {
        const y = startY + i * lineHeight;
        return `<tspan x="${n(anchorX)}" y="${n(y)}">${escapeSvgText(line)}</tspan>`;
      })
      .join("");
    return `<g transform="rotate(${SWIMLANE_LEFT_TEXT_ROTATE_DEG} ${n(cx)} ${n(cy)})"><text ${textStyleAttrs(node.style)} text-anchor="middle" x="${n(anchorX)}" y="${n(startY)}">${tspans}</text></g>`;
  }
  const area = nodeTextArea(node);
  if (!area) return "";
  const fontPx = node.style?.fontSize ?? 12;
  const lines =
    node.textLines ??
    wrapTextLines(label, area.width * TEXT_WIDTH_SAFETY, fontPx, node.style?.bold);
  if (node.subLabel?.text.trim()) {
    const sub = node.subLabel;
    const subPx = sub.fontSize ?? fontPx * 0.8;
    const subLines =
      node.subLines ?? wrapTextLines(sub.text, area.width * TEXT_WIDTH_SAFETY, subPx, sub.bold);
    const subStyle: Style = {
      ...node.style,
      fontSize: subPx,
      fontColor: sub.fontColor ?? node.style?.fontColor,
      bold: sub.bold ?? false,
    };
    return renderMixedLines(
      [
        ...lines.map((text) => ({ text, style: node.style ?? {} })),
        ...subLines.map((text) => ({ text, style: subStyle })),
      ],
      area,
      node.style,
    );
  }
  return renderFittedLines(lines, area, node.style);
}

/**
 * Lines with their own size/colour (title + subtitle). Baselines advance by
 * each line's own pitch, matching Visio's proportional paragraph spacing.
 */
export function renderMixedLines(
  lines: { text: string; style: Style }[],
  box: TextBox,
  blockStyle?: Style,
): string {
  const sizes = lines.map((l) => l.style.fontSize ?? 12);
  const anchor = textAnchor(blockStyle);
  const anchorX =
    anchor === "start" ? box.x : anchor === "end" ? box.x + box.width : box.x + box.width / 2;
  const blockH = mixedBlockHeightPx(sizes);
  const top =
    blockStyle?.verticalAlign === "top"
      ? box.y
      : blockStyle?.verticalAlign === "bottom"
        ? box.y + box.height - blockH
        : box.y + (box.height - blockH) / 2;
  let y = top + sizes[0]! * 0.92;
  const tspans = lines
    .map((l, i) => {
      if (i > 0) y += sizes[i]! * TEXT_LINE_PITCH;
      const color = l.style.fontColor ?? "#111111";
      const weight = l.style.bold ? "700" : "400";
      return `<tspan x="${n(anchorX)}" y="${n(y)}" font-size="${n(sizes[i]!)}" fill="${color}" font-weight="${weight}">${escapeSvgText(l.text)}</tspan>`;
    })
    .join("");
  return `<text xml:space="preserve" ${textStyleAttrs(blockStyle)} text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text>`;
}

/** Draw pre-wrapped lines centred (vertically) in a text area — mirrors Visio VertAlign. */
export function renderFittedLines(lines: string[], box: TextBox, style?: Style): string {
  const fontPx = style?.fontSize ?? 12;
  const anchor = textAnchor(style);
  const anchorX =
    anchor === "start" ? box.x : anchor === "end" ? box.x + box.width : box.x + box.width / 2;
  const pitch = fontPx * TEXT_LINE_PITCH;
  const blockH = textBlockHeightPx(lines.length, fontPx);
  let top: number;
  switch (style?.verticalAlign) {
    case "top":
      top = box.y;
      break;
    case "bottom":
      top = box.y + box.height - blockH;
      break;
    default:
      top = box.y + (box.height - blockH) / 2;
  }
  const first = top + fontPx * 0.92;
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${n(anchorX)}" y="${n(first + i * pitch)}">${escapeSvgText(line)}</tspan>`,
    )
    .join("");
  // xml:space keeps runs of spaces (column-aligned text such as "1   0.92")
  return `<text xml:space="preserve" ${textStyleAttrs(style)} text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text>`;
}

function polygonFromRel(node: PlacedNode, points: [number, number][]): string {
  const d = points
    .map(([fx, fy], i) => {
      const cmd = i === 0 ? "M" : "L";
      return `${cmd}${n(relX(node.x, node.width, fx))} ${n(relY(node.y, node.height, fy))}`;
    })
    .join(" ");
  return `${d} Z`;
}

export function renderNodeShape(node: PlacedNode): string {
  const { x, y, width, height } = node;
  const style = node.style;
  const label = nodeLabel(node);

  // fill/stroke "none" text overlays draw only their label (images still draw their picture)
  if (isLabelOverlay(node) && !isImageNode(node)) return label;

  const sa = strokeAttrs(style);
  const fa = fillAttrs(style);

  switch (node.kind) {
    case "roundedRect": {
      const r = node.cornerRadius ?? roundedRectRadiusPx(width, height);
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(r)}" ry="${n(r)}" ${fa} ${sa}/>${label}`;
    }
    case "rect":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ${fa} ${sa}/>${label}`;
    case "diamond": {
      const d = polygonFromRel(node, [
        [0.5, 1],
        [1, 0.5],
        [0.5, 0],
        [0, 0.5],
      ]);
      return `<path d="${d}" ${fa} ${sa}/>${label}`;
    }
    case "ellipse":
      return `<ellipse cx="${n(x + width / 2)}" cy="${n(y + height / 2)}" rx="${n(width / 2)}" ry="${n(height / 2)}" ${fa} ${sa}/>${label}`;
    case "cylinder": {
      const ry = height * 0.1;
      const leftX = relX(x, width, 0);
      const rightX = relX(x, width, 1);
      const sideTopY = relY(y, height, 0.1);
      const sideBotY = relY(y, height, 0.9);
      const d = [
        `M${n(leftX)} ${n(sideBotY)}`,
        `L${n(leftX)} ${n(sideTopY)}`,
        `A${n(width / 2)} ${n(ry)} 0 0 0 ${n(rightX)} ${n(sideTopY)}`,
        `L${n(rightX)} ${n(sideBotY)}`,
        `A${n(width / 2)} ${n(ry)} 0 0 1 ${n(leftX)} ${n(sideBotY)}`,
        "Z",
      ].join(" ");
      return `<path d="${d}" ${fa} ${sa}/>${label}`;
    }
    case "hexagon": {
      const d = polygonFromRel(node, [
        [0.2, 0],
        [0.8, 0],
        [1, 0.5],
        [0.8, 1],
        [0.2, 1],
        [0, 0.5],
      ]);
      return `<path d="${d}" ${fa} ${sa}/>${label}`;
    }
    case "note": {
      const d = polygonFromRel(node, [
        [0, 1],
        [0.85, 1],
        [1, 0.85],
        [1, 0],
        [0, 0],
      ]);
      return `<path d="${d}" ${fa} ${sa}/>${label}`;
    }
    case "component": {
      const d = polygonFromRel(node, [
        [0.15, 0],
        [1, 0],
        [0.85, 1],
        [0, 1],
      ]);
      return `<path d="${d}" ${fa} ${sa}/>${label}`;
    }
    case "actor": {
      const cx = relX(x, width, 0.5);
      const headCy = relY(y, height, 0.85);
      const headRx = width * 0.35;
      const headRy = height * 0.15;
      const parts = [
        `<ellipse cx="${n(cx)}" cy="${n(headCy)}" rx="${n(headRx)}" ry="${n(headRy)}" ${fa} ${sa}/>`,
        `<line x1="${n(cx)}" y1="${n(relY(y, height, 0.7))}" x2="${n(cx)}" y2="${n(relY(y, height, 0.35))}" ${sa}/>`,
        `<line x1="${n(cx)}" y1="${n(relY(y, height, 0.58))}" x2="${n(relX(x, width, 0.2))}" y2="${n(relY(y, height, 0.48))}" ${sa}/>`,
        `<line x1="${n(cx)}" y1="${n(relY(y, height, 0.58))}" x2="${n(relX(x, width, 0.8))}" y2="${n(relY(y, height, 0.48))}" ${sa}/>`,
        `<line x1="${n(cx)}" y1="${n(relY(y, height, 0.35))}" x2="${n(relX(x, width, 0.28))}" y2="${n(relY(y, height, 0))}" ${sa}/>`,
        `<line x1="${n(cx)}" y1="${n(relY(y, height, 0.35))}" x2="${n(relX(x, width, 0.72))}" y2="${n(relY(y, height, 0))}" ${sa}/>`,
      ];
      return `${parts.join("")}${label}`;
    }
    case "container": {
      const opacity = style?.opacity !== undefined ? style.opacity : 45;
      const faContainer = fillAttrs({ ...style, opacity }, DEFAULT_FILL);
      const cr = node.cornerRadius
        ? ` rx="${n(node.cornerRadius)}" ry="${n(node.cornerRadius)}"`
        : "";
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}"${cr} ${faContainer} ${sa}/>${label}`;
    }
    case "swimlane": {
      const headerSide = node.headerSide ?? "top";
      const header = node.headerSize ?? 30;
      const op = style?.opacity ?? 45;
      const faLane = fillAttrs({ ...style, opacity: op }, DEFAULT_FILL);
      if (headerSide === "left") {
        const wf = Math.min(0.35, Math.max(0.02, header / width));
        const splitX = relX(x, width, wf);
        const outer = `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ${faLane} ${sa}/>`;
        const divider = `<line x1="${n(splitX)}" y1="${n(y)}" x2="${n(splitX)}" y2="${n(y + height)}" ${sa}/>`;
        return `${outer}${divider}${label}`;
      }
      const hf = Math.min(0.4, Math.max(0.05, header / height));
      const splitY = relY(y, height, 1 - hf);
      const outer = `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ${faLane} ${sa}/>`;
      const divider = `<line x1="${n(x)}" y1="${n(splitY)}" x2="${n(x + width)}" y2="${n(splitY)}" ${sa}/>`;
      return `${outer}${divider}${label}`;
    }
    case "text":
      return label;
    case "placeholder": {
      if (node.placeholderOf === "image") {
        // Image without data: faint dashed frame only, never a text label.
        return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="none" stroke="#b0b7c3" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
      const phStyle: Style = { ...style, dashed: true };
      const saPh = strokeAttrs(phStyle);
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ${fa} ${saPh}/>${label}`;
    }
    case "image": {
      if (!node.image) {
        const phStyle: Style = { ...style, dashed: true };
        const saPh = strokeAttrs(phStyle);
        return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="none" ${saPh}/>${label}`;
      }
      const href = imageToDataUri(node.image.mime, node.image.data);
      const opacity =
        style?.opacity !== undefined && style.opacity < 100
          ? ` opacity="${n(style.opacity / 100)}"`
          : "";
      let transform = "";
      const cx = x + width / 2;
      const cy = y + height / 2;
      const parts: string[] = [];
      if (node.rotation) parts.push(`rotate(${n(node.rotation)} ${n(cx)} ${n(cy)})`);
      if (node.flipH)
        parts.push(`translate(${n(cx)} ${n(cy)}) scale(-1 1) translate(${n(-cx)} ${n(-cy)})`);
      if (node.flipV)
        parts.push(`translate(${n(cx)} ${n(cy)}) scale(1 -1) translate(${n(-cx)} ${n(-cy)})`);
      if (parts.length) transform = ` transform="${parts.join(" ")}"`;
      return `<image x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" href="${href}" preserveAspectRatio="xMidYMid meet"${opacity}${transform}/>${label}`;
    }
    default:
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ${fa} ${sa}/>${label}`;
  }
}

export function renderEdgeLabel(
  _edgeId: string,
  anchor: { x: number; y: number },
  label: string,
  style?: Style,
  labelBox?: LabelBox,
  angleDeg?: number,
): string {
  const fontPx = style?.fontSize ?? 11;
  const w = connectorLabelWidthPx(label, fontPx, style?.bold);
  const h = connectorLabelHeightPx(fontPx);
  const x = anchor.x - w / 2;
  const y = anchor.y - h / 2;
  let bg: string;
  let fontColor = style?.fontColor;
  if (labelBox) {
    const stroke = labelBox.stroke ?? style?.stroke ?? "#666666";
    const r = labelBox.rounded === false ? 0 : labelBadgeRadiusPx(h);
    const lw = Math.max(1, (style?.strokeWidth ?? 1) * 0.6);
    bg = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" ry="${n(r)}" fill="${labelBox.fill ?? "#ffffff"}" stroke="${stroke}" stroke-width="${n(lw)}"/>`;
    fontColor = labelBox.fontColor ?? style?.fontColor ?? stroke;
  } else {
    bg = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${style?.labelBackground ?? "#ffffff"}" stroke="none"/>`;
  }
  const box: TextBox = { x, y, width: w, height: h };
  const textStyle: Style = { ...style, fontSize: fontPx, align: "center", fontColor };
  const text = connectorLabelShouldWrap(label)
    ? renderTextInBox(label, box, textStyle)
    : renderTextLines([label], box, textStyle);
  if (angleDeg) {
    return `<g transform="rotate(${n(angleDeg)} ${n(anchor.x)} ${n(anchor.y)})">${bg}${text}</g>`;
  }
  return `${bg}${text}`;
}

export function arrowMarkerDefs(): string {
  const s = 4.5;
  return `<marker id="pv-arrow-end-open" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="strokeWidth" markerWidth="${s}" markerHeight="${s}" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker>
<marker id="pv-arrow-start-open" viewBox="0 0 10 10" refX="1" refY="5" markerUnits="strokeWidth" markerWidth="${s}" markerHeight="${s}" orient="auto"><path d="M 10 0 L 0 5 L 10 10" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker>`;
}

export function renderFilledArrowHead(
  tip: { x: number; y: number },
  dirRad: number,
  length: number,
  color: string,
): string {
  const halfW = length * 0.42;
  const backX = tip.x - length * Math.cos(dirRad);
  const backY = tip.y - length * Math.sin(dirRad);
  const leftX = backX + halfW * Math.sin(dirRad);
  const leftY = backY - halfW * Math.cos(dirRad);
  const rightX = backX - halfW * Math.sin(dirRad);
  const rightY = backY + halfW * Math.cos(dirRad);
  return `<path d="M${n(tip.x)} ${n(tip.y)} L${n(leftX)} ${n(leftY)} L${n(rightX)} ${n(rightY)} Z" fill="${color}" stroke="none"/>`;
}

export function segmentAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Remove `trimPx` of arc length from the end of a polyline. */
export function trimPathEnd(
  points: { x: number; y: number }[],
  trimPx: number,
): { x: number; y: number }[] {
  if (points.length < 2 || trimPx <= 0) return points;
  const total = points
    .slice(1)
    .reduce((s, p, i) => s + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  if (total <= trimPx) return points;
  const out = points.slice();
  let left = trimPx;
  while (out.length >= 2) {
    const end = out[out.length - 1]!;
    const prev = out[out.length - 2]!;
    const len = Math.hypot(end.x - prev.x, end.y - prev.y);
    if (len > left) {
      out[out.length - 1] = {
        x: end.x - ((end.x - prev.x) / len) * left,
        y: end.y - ((end.y - prev.y) / len) * left,
      };
      return out;
    }
    left -= len;
    out.pop();
  }
  return points;
}

export function trimPathStart(
  points: { x: number; y: number }[],
  trimPx: number,
): { x: number; y: number }[] {
  return trimPathEnd(points.slice().reverse(), trimPx).reverse();
}

/** Direction (radians) arriving at the last point, measured over ~`span` px. */
export function endTangent(points: { x: number; y: number }[], span = 6): number {
  const tip = points[points.length - 1]!;
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i]!;
    if (Math.hypot(tip.x - p.x, tip.y - p.y) >= span || i === 0) return segmentAngle(p, tip);
  }
  return 0;
}

/** How much of the line an end marker covers (the line stops there). */
export function markerTrimPx(kind: ArrowKind | undefined, len: number): number {
  switch (kind) {
    case "block":
    case "classic":
    case "triangle":
      return len;
    case "diamond":
      return len * 1.4;
    case "circle":
    case "openCircle":
      return len * 0.7;
    default:
      return 0;
  }
}

/** SVG for an end marker with its tip at `tip`, pointing along `dir`. */
export function renderEndMarker(
  kind: ArrowKind | undefined,
  tip: { x: number; y: number },
  dir: number,
  len: number,
  color: string,
  strokeWidth: number,
): string {
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  // local (along, across) → page
  const at = (a: number, b: number) => ({ x: tip.x + a * c - b * s, y: tip.y + a * s + b * c });
  const pts = (list: { x: number; y: number }[]) =>
    list.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ");
  const sw = n(strokeWidth);
  switch (kind) {
    case "block":
    case "classic":
      return renderFilledArrowHead(tip, dir, len, color);
    case "open":
      return `<path d="${pts([at(-len, -len * 0.42), at(0, 0), at(-len, len * 0.42)])}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="miter"/>`;
    case "triangle":
      return `<path d="${pts([at(0, 0), at(-len, -len * 0.45), at(-len, len * 0.45)])} Z" fill="#ffffff" stroke="${color}" stroke-width="${sw}"/>`;
    case "tee":
      // bar a little before the tip (as Visio/LibreOffice draw arrowhead 24)
      return `<path d="${pts([at(-len * 0.35, -len * 0.7), at(-len * 0.35, len * 0.7)])}" fill="none" stroke="${color}" stroke-width="${n(Math.max(1.5, strokeWidth * 1.6))}"/>`;
    case "diamond": {
      const l = len * 1.4;
      return `<path d="${pts([at(0, 0), at(-l / 2, -len * 0.4), at(-l, 0), at(-l / 2, len * 0.4)])} Z" fill="#ffffff" stroke="${color}" stroke-width="${sw}"/>`;
    }
    case "circle":
    case "openCircle": {
      const r = len * 0.35;
      const ctr = at(-r, 0);
      const fill = kind === "circle" ? color : "#ffffff";
      return `<circle cx="${n(ctr.x)}" cy="${n(ctr.y)}" r="${n(r)}" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`;
    }
    default:
      return "";
  }
}

/** Legacy SVG marker reference (all ends are drawn explicitly now). */
export function markerRef(_kind: ArrowKind | undefined, _end: boolean, _strokeWidth = 1): string {
  return "";
}
