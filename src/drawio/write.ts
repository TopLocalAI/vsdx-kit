import { nodeMapFromDiagram } from "../geometry/edge-endpoints.js";
import { labelBackgroundAt } from "../geometry/label-background.js";
import { imageToDataUri } from "../image/data-uri.js";
import type { PlacedDiagram, PlacedEdge, PlacedNode } from "../types.js";
import { edgePathPx, labelAnchorPx } from "../vsdx/connectors.js";
import { parseDrawioStyle } from "./style.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelToHtml(label: string): string {
  return escapeXml(label).replace(/\n/g, "&#xa;");
}

function styleParts(style?: PlacedNode["style"]): string {
  const parts: string[] = [];
  if (style?.fill) parts.push(`fillColor=${style.fill}`);
  if (style?.stroke) parts.push(`strokeColor=${style.stroke}`);
  if (style?.fontColor) parts.push(`fontColor=${style.fontColor}`);
  if (style?.fontSize) parts.push(`fontSize=${style.fontSize}`);
  if (style?.strokeWidth) parts.push(`strokeWidth=${style.strokeWidth}`);
  if (style?.dashed) parts.push("dashed=1");
  if (style?.bold) parts.push("fontStyle=1");
  if (style?.italic) parts.push("fontStyle=2");
  if (style?.align) parts.push(`align=${style.align}`);
  if (style?.verticalAlign) parts.push(`verticalAlign=${style.verticalAlign}`);
  return parts.join(";");
}

function nodeStyleForKind(node: PlacedNode): string {
  const base = "whiteSpace=wrap;html=1;spacing=8;strokeWidth=1.5;fontSize=13;fontColor=#1F2937;";
  const custom = styleParts(node.style);
  const extra = custom ? `${custom};` : "";

  switch (node.kind) {
    case "roundedRect":
      return `${base}rounded=1;arcSize=14;${extra}`;
    case "diamond":
      return `${base}rhombus;${extra}`;
    case "ellipse":
      return `${base}ellipse;${extra}`;
    case "cylinder":
      return `${base}shape=cylinder3;boundedLbl=1;backgroundOutline=1;${extra}`;
    case "note":
      return `${base}shape=note;${extra}`;
    case "hexagon":
      return `${base}shape=hexagon;perimeter=hexagonPerimeter2;size=0.2;${extra}`;
    case "component":
      return `${base}shape=component;${extra}`;
    case "actor":
      return `${base}shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;${extra}`;
    case "container":
      return `${base}container=1;rounded=1;arcSize=6;verticalAlign=top;align=left;spacingLeft=12;spacingTop=4;fontStyle=1;${extra}`;
    case "swimlane": {
      const horizontal = node.headerSide === "left" ? 0 : 1;
      const startSize = node.headerSize ?? 28;
      return `${base}swimlane;horizontal=${horizontal};startSize=${startSize};rounded=0;${extra}`;
    }
    case "text":
      return `${base}text;strokeColor=none;${extra}`;
    case "placeholder":
      return `${base}shape=${node.placeholderOf ?? "rect"};${extra}`;
    case "image": {
      const uri = node.image ? imageToDataUri(node.image.mime, node.image.data) : "";
      const flip = `${node.flipH ? "flipH=1;" : ""}${node.flipV ? "flipV=1;" : ""}`;
      const rot = node.rotation ? `rotation=${node.rotation};` : "";
      return `${base}shape=image;imageAspect=0;aspect=fixed;fillColor=none;strokeColor=none;image=${uri};${flip}${rot}${extra}`;
    }
    default:
      return `${base}${extra}`;
  }
}

const DRAWIO_ARROW: Record<string, string> = {
  block: "block;FILL=1",
  classic: "block;FILL=1",
  open: "open;FILL=0",
  triangle: "block;FILL=0",
  tee: "baseDash;FILL=0",
  diamond: "diamond;FILL=0",
  circle: "oval;FILL=1",
  openCircle: "oval;FILL=0",
};

function edgeArrowStyle(edge: PlacedEdge, which: "start" | "end"): string {
  const value = which === "start" ? edge.style?.startArrow : edge.style?.endArrow;
  const kind = value ?? (which === "start" ? "none" : "block");
  if (kind === "none") return `${which}Arrow=none;`;
  const [name, fill] = (DRAWIO_ARROW[kind] ?? DRAWIO_ARROW.block!).split(";FILL=");
  if (which === "start" && (kind === "block" || kind === "classic")) return "startArrow=classic;";
  return `${which}Arrow=${name};${which}Fill=${fill};`;
}

function edgeStyle(edge: PlacedEdge, labelBackground = "#ffffff"): string {
  const stroke = edge.style?.stroke ?? "#475569";
  const dashed = edge.style?.dashed ? "dashed=1;" : "";
  const custom = styleParts(edge.style);
  const anchors: string[] = [];
  if (edge.style?.exitX !== undefined) anchors.push(`exitX=${edge.style.exitX}`);
  if (edge.style?.exitY !== undefined) anchors.push(`exitY=${edge.style.exitY}`);
  if (edge.style?.entryX !== undefined) anchors.push(`entryX=${edge.style.entryX}`);
  if (edge.style?.entryY !== undefined) anchors.push(`entryY=${edge.style.entryY}`);
  const anchorStr = anchors.length > 0 ? `${anchors.join(";")};` : "";
  return `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=12;html=1;strokeWidth=1.5;labelBackgroundColor=${labelBackground};strokeColor=${stroke};${dashed}${edgeArrowStyle(edge, "start")}${edgeArrowStyle(edge, "end")}${custom ? `${custom};` : ""}${anchorStr}`;
}

function geometryAttrs(x: number, y: number, w: number, h: number): string {
  return `x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}"`;
}

function edgeGeometry(edge: PlacedEdge): string {
  const labelOffset =
    edge.label && edge.labelRelativeX !== undefined ? `x="${edge.labelRelativeX}" ` : "";
  const labelNudge = edge.label ? '<mxPoint as="offset" y="-12" />' : "";
  const waypoints =
    edge.waypoints && edge.waypoints.length > 0
      ? `<Array as="points">${edge.waypoints
          .map((p) => `<mxPoint x="${Math.round(p.x)}" y="${Math.round(p.y)}" />`)
          .join("")}</Array>`
      : "";
  return `<mxGeometry ${labelOffset}relative="1" as="geometry">${labelNudge}${waypoints}</mxGeometry>`;
}

function graphModelXml(d: PlacedDiagram): string {
  const pageW = Math.max(850, Math.ceil(d.width));
  const pageH = Math.max(1100, Math.ceil(d.height));
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  for (const node of d.nodes) {
    const value = node.label ? labelToHtml(node.label) : "";
    cells.push(
      `<mxCell id="${escapeXml(node.id)}" value="${value}" style="${nodeStyleForKind(node)}" vertex="1" parent="1"><mxGeometry ${geometryAttrs(node.x, node.y, node.width, node.height)} as="geometry" /></mxCell>`,
    );
  }

  for (const edge of d.edges) {
    if (!edge.source || !edge.target) continue;
    const value = edge.label ? labelToHtml(edge.label) : "";
    cells.push(
      `<mxCell id="${escapeXml(edge.id)}" value="${value}" style="${edgeStyle(edge, edge.label ? labelBackgroundAt(d.nodes, labelAnchorPx(edge, edgePathPx(edge, nodeMapFromDiagram(d.nodes)))) : undefined)}" edge="1" parent="1" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">${edgeGeometry(edge)}</mxCell>`,
    );
  }

  return `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0"><root>${cells.join("")}</root></mxGraphModel>`;
}

export interface DrawioPage {
  name?: string;
  diagram: PlacedDiagram;
}

/** Serialize one diagram (or several pages) as an uncompressed draw.io file. */
export function placedToDrawio(input: PlacedDiagram | DrawioPage[]): string {
  const pages: DrawioPage[] = Array.isArray(input) ? input : [{ diagram: input }];
  const diagrams = pages
    .map((page, i) => {
      const name = escapeXml(page.name?.trim() || page.diagram.title?.trim() || `Page-${i + 1}`);
      return `<diagram name="${name}" id="page-${i + 1}">${graphModelXml(page.diagram)}</diagram>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="vsdx-kit" version="22.1.0">${diagrams}</mxfile>`;
}

export function shapeKindFromDrawioStyle(style: string): import("../types.js").ShapeKind {
  const st = parseDrawioStyle(style);
  if (st.shape?.startsWith("mxgraph.")) return "placeholder";
  if (st.shape === "image") return "image";
  if (st.shape === "umlActor") return "actor";
  if (st.shape === "cylinder3" || st.shape === "cylinder") return "cylinder";
  if (st.shape === "note") return "note";
  if (st.shape === "component") return "component";
  if (st.swimlane === "1") return "swimlane";
  if (st.container === "1") return "container";
  if (st.text === "1" && st.strokeColor === "none") return "text";
  if (st.ellipse === "1" || st.shape === "ellipse") return "ellipse";
  if (st.rhombus === "1") return "diamond";
  if (st.rounded === "1") return "roundedRect";
  return "rect";
}
