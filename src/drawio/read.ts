import { inflateRawSync } from "node:zlib";
import { decodeHTML } from "entities";
import { XMLParser } from "fast-xml-parser";
import { defaultExitEntryFractions, perimeterAnchor } from "../geometry/path.js";
import { parseDrawioImageRef } from "../image/data-uri.js";
import { normalizeEmbeddedImage } from "../image/normalize.js";
import type { PlacedDiagram, PlacedEdge, PlacedNode, ShapeKind, Style } from "../types.js";
import { parseDrawioStyle } from "./style.js";

export interface DrawioImportResult {
  diagram: PlacedDiagram;
  placeholderCount: number;
  warnings: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) =>
    name === "mxCell" ||
    name === "mxPoint" ||
    name === "Array" ||
    name === "UserObject" ||
    name === "object" ||
    name === "diagram",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function htmlToPlainText(html: string | undefined): string {
  if (!html) return "";
  let s = decodeHTML(html);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<div[^>]*>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&#xa;|&#10;/gi, "\n");
  return s.replace(/\n+$/, "");
}

function styleFromMx(st: Record<string, string>): Style {
  const style: Style = {};
  if (st.fillColor) style.fill = st.fillColor === "none" ? "none" : st.fillColor;
  if (st.strokeColor) style.stroke = st.strokeColor === "none" ? "none" : st.strokeColor;
  if (st.fontColor) style.fontColor = st.fontColor;
  if (st.fontSize) style.fontSize = Number(st.fontSize);
  if (st.dashed === "1") style.dashed = true;
  if (st.fontStyle) {
    const fs = Number(st.fontStyle);
    if (fs & 1) style.bold = true;
    if (fs & 2) style.italic = true;
  }
  if (st.align) style.align = st.align as Style["align"];
  if (st.verticalAlign) style.verticalAlign = st.verticalAlign as Style["verticalAlign"];
  if (st.opacity) style.opacity = Number(st.opacity);
  return style;
}

interface ShapeKindMapping {
  kind: ShapeKind;
  placeholderOf?: string;
  imageParseFailed?: boolean;
  remoteImageUrl?: string;
}

function mapShapeKind(st: Record<string, string>): ShapeKindMapping {
  if (st.shape === "image") {
    const parsed = parseDrawioImageRef(st.image);
    if (parsed.ok) return { kind: "image" };
    if (parsed.reason === "remote-url") {
      return { kind: "placeholder", placeholderOf: "image", remoteImageUrl: parsed.url };
    }
    return { kind: "placeholder", placeholderOf: "image", imageParseFailed: true };
  }
  if (st.shape?.startsWith("mxgraph.")) return { kind: "placeholder", placeholderOf: st.shape };
  if (st.shape === "umlActor") return { kind: "actor" };
  if (st.shape === "cylinder3" || st.shape === "cylinder") return { kind: "cylinder" };
  if (st.shape === "note") return { kind: "note" };
  if (st.shape === "hexagon") return { kind: "hexagon" };
  if (st.shape === "component") return { kind: "component" };
  if (st.swimlane === "1" || st.childLayout === "stackLayout") return { kind: "swimlane" };
  if (st.container === "1") return { kind: "container" };
  // draw.io "text" style has no frame unless a stroke/fill colour is set explicitly
  if (
    st.text === "1" &&
    (!st.strokeColor || st.strokeColor === "none") &&
    (!st.fillColor || st.fillColor === "none")
  )
    return { kind: "text" };
  if (st.ellipse === "1" || st.shape === "ellipse") return { kind: "ellipse" };
  if (st.rhombus === "1") return { kind: "diamond" };
  if (st.rounded === "1") return { kind: "roundedRect" };
  return { kind: "rect" };
}

function edgeArrowStyle(st: Record<string, string>): PlacedEdge["style"] {
  const style: PlacedEdge["style"] = styleFromMx(st);
  if (st.endArrow === "none" || st.endArrow === "0") style.endArrow = "none";
  else if (st.endArrow === "open") style.endArrow = "open";
  else style.endArrow = "classic";
  if (st.startArrow === "classic" || st.startArrow === "block") style.startArrow = "classic";
  else style.startArrow = "none";
  style.orthogonal = st.edgeStyle !== "none";
  if (st.exitX) style.exitX = Number(st.exitX);
  if (st.exitY) style.exitY = Number(st.exitY);
  if (st.entryX) style.entryX = Number(st.entryX);
  if (st.entryY) style.entryY = Number(st.entryY);
  return style;
}

interface MxCell {
  id: string;
  parent?: string;
  value?: string;
  style?: string;
  vertex?: string;
  edge?: string;
  source?: string;
  target?: string;
  mxGeometry?: {
    x?: string;
    y?: string;
    width?: string;
    height?: string;
    relative?: string;
    as?: string;
    mxPoint?: { x?: string; y?: string; as?: string } | { x?: string; y?: string; as?: string }[];
    Array?: { as?: string; mxPoint?: { x?: string; y?: string } | { x?: string; y?: string }[] };
  };
}

function geomBox(cell: MxCell, offsetX: number, offsetY: number) {
  const g = cell.mxGeometry ?? {};
  const x = Number(g.x ?? 0) + offsetX;
  const y = Number(g.y ?? 0) + offsetY;
  const width = Number(g.width ?? 0);
  const height = Number(g.height ?? 0);
  return { x, y, width, height };
}

function applyAspectFixed(
  box: { x: number; y: number; width: number; height: number },
  st: Record<string, string>,
): { x: number; y: number; width: number; height: number } {
  if (st.aspect !== "fixed") return box;
  const side = Math.min(box.width, box.height);
  return {
    x: box.x + (box.width - side) / 2,
    y: box.y + (box.height - side) / 2,
    width: side,
    height: side,
  };
}

function shapeKindForCell(cell: MxCell | undefined): ShapeKind {
  if (!cell) return "rect";
  return mapShapeKind(parseDrawioStyle(cell.style)).kind;
}

// draw.io stores compressed pages as base64(deflateRaw(encodeURIComponent(xml))).
function inflateDiagramText(text: string): string {
  const inflated = inflateRawSync(Buffer.from(text.trim(), "base64")).toString("utf8");
  if (inflated.trimStart().startsWith("<")) return inflated;
  try {
    return decodeURIComponent(inflated);
  } catch {
    return inflated;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: parsed XML tree
type XmlNode = any;

interface RawPage {
  name: string;
  model: XmlNode;
}

/** Split a draw.io document into its pages (uncompressed or compressed). */
export function readDrawioPages(xml: string): RawPage[] {
  const doc = parser.parse(xml);
  if (doc.mxGraphModel) return [{ name: "Page-1", model: doc.mxGraphModel }];
  const mxfile = doc.mxfile;
  if (!mxfile) throw new Error("Not a draw.io file: no <mxfile> or <mxGraphModel> element found");
  const pages: RawPage[] = [];
  asArray<XmlNode>(mxfile.diagram).forEach((d, i) => {
    const name = (typeof d === "object" && d?.name ? String(d.name) : "") || `Page-${i + 1}`;
    if (typeof d === "object" && d?.mxGraphModel) {
      pages.push({ name, model: d.mxGraphModel });
      return;
    }
    const text = typeof d === "string" ? d : typeof d === "object" ? d?.["#text"] : undefined;
    if (typeof text !== "string" || !text.trim()) {
      pages.push({ name, model: {} });
      return;
    }
    const inner = parser.parse(inflateDiagramText(text));
    pages.push({ name, model: inner.mxGraphModel ?? {} });
  });
  if (pages.length === 0) throw new Error("The draw.io file contains no pages");
  return pages;
}

export interface DrawioPageResult extends DrawioImportResult {
  name: string;
}

/** Import every page of a draw.io file. */
export function drawioXmlToPages(xml: string): DrawioPageResult[] {
  return readDrawioPages(xml).map((page) => ({ name: page.name, ...modelToPlaced(page.model) }));
}

/** Import one page (default: the first) of a draw.io file. */
export function drawioXmlToPlacedDiagram(xml: string, pageIndex = 0): DrawioImportResult {
  const pages = readDrawioPages(xml);
  const page = pages[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex + 1} not found (file has ${pages.length})`);
  return modelToPlaced(page.model);
}

function modelToPlaced(model: XmlNode): DrawioImportResult {
  const root = model?.root;
  const cells = asArray<MxCell>(root?.mxCell);
  // Cells with custom properties are wrapped: <UserObject label=".." id=".."><mxCell/></UserObject>
  for (const wrapper of [
    ...asArray<XmlNode>(root?.UserObject),
    ...asArray<XmlNode>(root?.object),
  ]) {
    const inner = asArray<MxCell>(wrapper?.mxCell)[0];
    if (!inner || !wrapper.id) continue;
    cells.push({ ...inner, id: String(wrapper.id), value: wrapper.label ?? inner.value });
  }

  const cellById = new Map<string, MxCell>();
  for (const c of cells) {
    if (c?.id) cellById.set(String(c.id), c);
  }

  const modelPageW = Number(model?.pageWidth ?? 850);
  const modelPageH = Number(model?.pageHeight ?? 1100);

  const offsets = new Map<string, { x: number; y: number }>();
  offsets.set("0", { x: 0, y: 0 });
  offsets.set("1", { x: 0, y: 0 });

  function absOffset(parentId: string | undefined): { x: number; y: number } {
    if (!parentId) return { x: 0, y: 0 };
    if (offsets.has(parentId)) return offsets.get(parentId)!;
    const parent = cellById.get(parentId);
    if (!parent || parent.edge === "1") return { x: 0, y: 0 };
    const po = absOffset(parent.parent);
    const g = parent.mxGeometry ?? {};
    const ox = po.x + Number(g.x ?? 0);
    const oy = po.y + Number(g.y ?? 0);
    offsets.set(parentId, { x: ox, y: oy });
    return { x: ox, y: oy };
  }

  for (const c of cells) {
    if (c.parent) absOffset(c.id);
  }

  let placeholderCount = 0;
  const warnings: string[] = [];
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  const edgeLabels = new Map<string, string>();

  for (const c of cells) {
    if (!c?.id || c.id === "0" || c.id === "1") continue;
    if (c.edge === "1") continue;
    if (c.vertex !== "1") continue;
    const parent = cellById.get(c.parent ?? "");
    if (parent?.edge === "1") {
      edgeLabels.set(parent.id, htmlToPlainText(String(c.value ?? "")));
      continue;
    }
    const off = absOffset(c.parent);
    const st = parseDrawioStyle(c.style);
    const mapped = mapShapeKind(st);
    if (mapped.kind === "placeholder") placeholderCount++;
    let box = geomBox(c, off.x, off.y);
    if (mapped.kind === "ellipse" || (mapped.kind === "image" && st.aspect === "fixed")) {
      box = applyAspectFixed(box, st);
    }
    const node: PlacedNode = {
      id: c.id,
      kind: mapped.kind,
      ...box,
      label: htmlToPlainText(String(c.value ?? "")),
      style: styleFromMx(st),
      parentId: c.parent && c.parent !== "1" ? c.parent : undefined,
      placeholderOf: mapped.placeholderOf,
    };
    if (mapped.kind === "image" && st.image) {
      const parsed = parseDrawioImageRef(st.image);
      if (parsed.ok) {
        const normalized = normalizeEmbeddedImage(parsed.mime, parsed.data, box.width, box.height);
        if (normalized) {
          node.image = {
            mime: normalized.mime,
            data: normalized.data,
            pixelWidth: normalized.pixelWidth,
            pixelHeight: normalized.pixelHeight,
          };
        } else {
          node.kind = "placeholder";
          node.placeholderOf = "image";
          placeholderCount++;
          warnings.push(`cell ${c.id}: unsupported image payload`);
        }
      }
    }
    if (mapped.remoteImageUrl) {
      warnings.push(`cell ${c.id}: remote image URL not embedded (${mapped.remoteImageUrl})`);
    } else if (mapped.imageParseFailed) {
      warnings.push(`cell ${c.id}: image data could not be parsed`);
    }
    if (st.flipH === "1") node.flipH = true;
    if (st.flipV === "1") node.flipV = true;
    if (st.rotation) node.rotation = Number(st.rotation);
    if (mapped.kind === "swimlane" && st.startSize) {
      node.headerSize = Number(st.startSize);
      node.headerSide = st.horizontal === "0" ? "left" : "top";
    }
    nodes.push(node);
    // Picture labels are not drawn inside a Visio Foreign shape: keep them as a caption.
    if ((node.kind === "image" || node.kind === "actor") && node.label?.trim()) {
      const fontPx = node.style?.fontSize ?? 12;
      const lines = node.label.split("\n").length;
      const height = Math.ceil(lines * fontPx * 1.25 + 6);
      const below = st.verticalLabelPosition === "bottom" || node.kind === "actor";
      const width = Math.max(node.width, 120);
      nodes.push({
        id: `${c.id}::caption`,
        kind: "text",
        x: node.x + node.width / 2 - width / 2,
        y: below ? node.y + node.height + 2 : node.y + node.height / 2 - height / 2,
        width,
        height,
        label: node.label,
        parentId: node.parentId,
        style: {
          ...node.style,
          fill: "none",
          stroke: "none",
          align: "center",
          verticalAlign: below ? "top" : "middle",
        },
      });
      if (node.kind === "actor") node.label = undefined;
    }
  }

  for (const c of cells) {
    if (c.edge !== "1") continue;
    const st = parseDrawioStyle(c.style);
    const g = c.mxGeometry ?? {};
    const off = absOffset(c.parent);
    const edge: PlacedEdge = {
      id: c.id,
      source: c.source,
      target: c.target,
      style: edgeArrowStyle(st),
      label: htmlToPlainText(String(c.value ?? "")) || edgeLabels.get(c.id) || undefined,
    };

    const waypoints: { x: number; y: number }[] = [];
    for (const arr of asArray(g.Array)) {
      if (arr.as === "points" || arr.as === undefined) {
        for (const pt of asArray(arr.mxPoint)) {
          if (pt && pt.x !== undefined) {
            waypoints.push({
              x: Number(pt.x) + off.x,
              y: Number(pt.y) + off.y,
            });
          }
        }
      }
    }
    if (waypoints.length) edge.waypoints = waypoints;

    if (g.relative === "1" && g.x !== undefined) {
      edge.labelRelativeX = Number(g.x);
    }

    const mxPoints = asArray(g.mxPoint);
    for (const pt of mxPoints) {
      if (pt.as === "sourcePoint") {
        edge.sourcePoint = {
          x: Number(pt.x ?? 0) + off.x,
          y: Number(pt.y ?? 0) + off.y,
        };
      }
      if (pt.as === "targetPoint") {
        edge.targetPoint = {
          x: Number(pt.x ?? 0) + off.x,
          y: Number(pt.y ?? 0) + off.y,
        };
      }
      if (pt.as === "offset") {
        edge.labelOffset = {
          x: Number(pt.x ?? 0),
          y: Number(pt.y ?? 0),
        };
      }
    }

    const hasExit = st.exitX !== undefined;
    const hasExitY = st.exitY !== undefined;
    const hasEntry = st.entryX !== undefined;
    const hasEntryY = st.entryY !== undefined;
    let exitX = hasExit ? Number(st.exitX) : 0.5;
    let exitY = hasExitY ? Number(st.exitY) : 0.5;
    let entryX = hasEntry ? Number(st.entryX) : 0.5;
    let entryY = hasEntryY ? Number(st.entryY) : 0.5;

    if (c.source && c.target && cellById.has(c.source) && cellById.has(c.target)) {
      const sn = cellById.get(c.source)!;
      const tn = cellById.get(c.target)!;
      const so = absOffset(sn.parent);
      const to = absOffset(tn.parent);
      const sst = parseDrawioStyle(sn.style);
      const tst = parseDrawioStyle(tn.style);
      let sb = geomBox(sn, so.x, so.y);
      let tb = geomBox(tn, to.x, to.y);
      if (shapeKindForCell(sn) === "ellipse") sb = applyAspectFixed(sb, sst);
      if (shapeKindForCell(tn) === "ellipse") tb = applyAspectFixed(tb, tst);
      const sourceRhombus = shapeKindForCell(sn) === "diamond";
      const targetRhombus = shapeKindForCell(tn) === "diamond";
      if (!hasExit || !hasExitY || !hasEntry || !hasEntryY) {
        const d = defaultExitEntryFractions(sb, tb, sourceRhombus, targetRhombus);
        if (!hasExit) exitX = d.exitX;
        if (!hasExitY) exitY = d.exitY;
        if (!hasEntry) entryX = d.entryX;
        if (!hasEntryY) entryY = d.entryY;
      }
      const targetCenter = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
      const sourceCenter = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 };
      if (!edge.sourcePoint) {
        edge.sourcePoint = perimeterAnchor(
          sb,
          exitX,
          exitY,
          targetCenter,
          shapeKindForCell(sn) === "ellipse",
          sourceRhombus,
        );
      }
      if (!edge.targetPoint) {
        edge.targetPoint = perimeterAnchor(
          tb,
          entryX,
          entryY,
          sourceCenter,
          shapeKindForCell(tn) === "ellipse",
          targetRhombus,
        );
      }
    } else {
      if (!edge.sourcePoint && c.source && cellById.has(c.source)) {
        const sn = cellById.get(c.source)!;
        const so = absOffset(sn.parent);
        const sst = parseDrawioStyle(sn.style);
        let sb = geomBox(sn, so.x, so.y);
        if (shapeKindForCell(sn) === "ellipse") sb = applyAspectFixed(sb, sst);
        const toward = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 + 1 };
        edge.sourcePoint = perimeterAnchor(
          sb,
          exitX,
          exitY,
          toward,
          shapeKindForCell(sn) === "ellipse",
          shapeKindForCell(sn) === "diamond",
        );
      }
      if (!edge.targetPoint && c.target && cellById.has(c.target)) {
        const tn = cellById.get(c.target)!;
        const to = absOffset(tn.parent);
        const tst = parseDrawioStyle(tn.style);
        let tb = geomBox(tn, to.x, to.y);
        if (shapeKindForCell(tn) === "ellipse") tb = applyAspectFixed(tb, tst);
        const toward = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 - 1 };
        edge.targetPoint = perimeterAnchor(
          tb,
          entryX,
          entryY,
          toward,
          shapeKindForCell(tn) === "ellipse",
          shapeKindForCell(tn) === "diamond",
        );
      }
    }

    edges.push(edge);
  }

  return {
    diagram: {
      width: modelPageW,
      height: modelPageH,
      nodes,
      edges,
    },
    placeholderCount,
    warnings,
  };
}
