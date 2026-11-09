import type { PlacedDiagram, PlacedEdge, PlacedNode } from "../types.js";
import { connectorLabelHeightPx, connectorLabelWidthPx } from "./connector-label.js";
import { curvePathPx } from "./curve.js";
import { enrichEdgeEndpoints, nodeMapFromDiagram } from "./edge-endpoints.js";
import {
  dedupePoints,
  orthogonalizePathEndpoints,
  orthogonalPathPx,
  pointAlongPath,
} from "./path.js";

/** 0.25 inch margin (24 px at 96 dpi scale used by draw.io page coords). */
export const CONTENT_MARGIN_PX = 24;

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function includePoint(bounds: ContentBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function includeRect(bounds: ContentBounds, x: number, y: number, w: number, h: number): void {
  includePoint(bounds, x, y);
  includePoint(bounds, x + w, y + h);
}

function edgePathPxForBounds(
  edge: PlacedEdge,
  nodeById: Map<string, PlacedNode>,
): { x: number; y: number }[] {
  const routed = enrichEdgeEndpoints(edge, nodeById);
  const beginPx = routed.sourcePoint ?? { x: 0, y: 0 };
  const endPx = routed.targetPoint ?? beginPx;
  if (routed.style?.curved || routed.style?.straight) {
    const ctrl = dedupePoints([beginPx, ...(routed.waypoints ?? []), endPx]);
    return routed.style.curved ? curvePathPx(ctrl) : ctrl;
  }
  let path: { x: number; y: number }[];
  if (routed.waypoints && routed.waypoints.length > 0) {
    path = dedupePoints([beginPx, ...routed.waypoints, endPx]);
  } else {
    path = dedupePoints(orthogonalPathPx(beginPx, endPx, routed.style?.orthogonal !== false));
  }
  return orthogonalizePathEndpoints(path);
}

function labelAnchorForBounds(
  edge: PlacedEdge,
  pathPx: { x: number; y: number }[],
): { x: number; y: number } {
  const relX = edge.labelRelativeX ?? 0;
  const t = (relX + 1) / 2;
  const base = pointAlongPath(pathPx, t);
  const off = edge.labelOffset;
  if (!off) return base;
  return { x: base.x + off.x, y: base.y + off.y };
}

function edgeLabelBounds(
  edge: PlacedEdge,
  pathPx: { x: number; y: number }[],
): ContentBounds | null {
  if (!edge.label) return null;
  const fontPx = edge.style?.fontSize ?? 11;
  const w = connectorLabelWidthPx(edge.label, fontPx, edge.style?.bold);
  const h = connectorLabelHeightPx(fontPx);
  const anchor = labelAnchorForBounds(edge, pathPx);
  return {
    minX: anchor.x - w / 2,
    minY: anchor.y - h / 2,
    maxX: anchor.x + w / 2,
    maxY: anchor.y + h / 2,
  };
}

/** Axis-aligned bounds of all diagram content (nodes, edge geometry, edge labels). */
export function contentBounds(diagram: PlacedDiagram): ContentBounds {
  const bounds: ContentBounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const node of diagram.nodes) {
    includeRect(bounds, node.x, node.y, node.width, node.height);
  }

  const nodeById = nodeMapFromDiagram(diagram.nodes);
  for (const edge of diagram.edges) {
    const pathPx = edgePathPxForBounds(edge, nodeById);
    for (const p of pathPx) includePoint(bounds, p.x, p.y);
    const lb = edgeLabelBounds(edge, pathPx);
    if (lb) {
      includePoint(bounds, lb.minX, lb.minY);
      includePoint(bounds, lb.maxX, lb.maxY);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return bounds;
}

function shiftNode(node: PlacedNode, dx: number, dy: number): PlacedNode {
  return { ...node, x: node.x + dx, y: node.y + dy };
}

function shiftEdge(edge: PlacedEdge, dx: number, dy: number): PlacedEdge {
  const shiftPt = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...edge,
    sourcePoint: edge.sourcePoint ? shiftPt(edge.sourcePoint) : undefined,
    targetPoint: edge.targetPoint ? shiftPt(edge.targetPoint) : undefined,
    waypoints: edge.waypoints?.map(shiftPt),
  };
}

/** Translate content into the margin inset and set page width/height to bounds + margin. */
export function fitDiagramToContent(
  diagram: PlacedDiagram,
  marginPx = CONTENT_MARGIN_PX,
): PlacedDiagram {
  const b = contentBounds(diagram);
  const dx = marginPx - b.minX;
  const dy = marginPx - b.minY;
  const width = b.maxX - b.minX + marginPx * 2;
  const height = b.maxY - b.minY + marginPx * 2;
  return {
    ...diagram,
    width,
    height,
    nodes: diagram.nodes.map((n) => shiftNode(n, dx, dy)),
    edges: diagram.edges.map((e) => shiftEdge(e, dx, dy)),
  };
}
