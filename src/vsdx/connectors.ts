import { connectorLabelBoxPx, labelBadgeRadiusPx } from "../geometry/connector-label.js";
import { arcSagitta, curvePathPx } from "../geometry/curve.js";
import { enrichEdgeEndpoints, nodeMapFromDiagram } from "../geometry/edge-endpoints.js";
import {
  dedupePoints,
  orthogonalizePathEndpoints,
  orthogonalPathPx,
  pathMidpoint,
  pointAlongPath,
} from "../geometry/path.js";
import type { ArrowKind, PlacedDiagram, PlacedEdge, PlacedNode } from "../types.js";
import { charStyle, connectorLabelCells, textBlock } from "./text.js";
import { boxFromPx, inch, pxToInX, pxToInY } from "./units.js";

const DYNAMIC_CONNECTOR_MASTER = 4;
/** Flip if Visio's ArcTo bow convention turns out mirrored. */
const VISIO_BOW_SIGN = 1;

/**
 * Visio arrowhead index (BeginArrow / EndArrow). Checked against the
 * LibreOffice (libvisio) table: 1 open, 4 filled triangle, 14 hollow
 * triangle, 24 perpendicular bar (inhibition ⊣), 22 diamond, 10 dot,
 * 20 hollow circle.
 */
export function visioArrow(kind: ArrowKind | undefined): string {
  switch (kind) {
    case "open":
      return "1";
    case "classic":
    case "block":
      return "4";
    case "triangle":
      return "14";
    case "tee":
      return "24";
    case "diamond":
      return "22";
    case "circle":
      return "10";
    case "openCircle":
      return "20";
    default:
      return "0";
  }
}

export function visioLinePattern(dashed?: boolean): string {
  return dashed ? `<Cell N="LinePattern" V="2"/>` : "";
}

interface PagePoint {
  x: number;
  y: number;
}

function toPagePx(x: number, y: number, pageHeightIn: number): PagePoint {
  return { x: pxToInX(x), y: pxToInY(y, pageHeightIn) };
}

function layoutConnector(points: PagePoint[]): {
  pinX: number;
  pinY: number;
  width: number;
  height: number;
  locPinX: number;
  locPinY: number;
  localPoints: PagePoint[];
  begin: PagePoint;
  end: PagePoint;
} {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (maxX - minX < 0.01) {
    minX -= 0.005;
    maxX += 0.005;
  }
  if (maxY - minY < 0.01) {
    minY -= 0.005;
    maxY += 0.005;
  }
  const width = inch(maxX - minX);
  const height = inch(maxY - minY);
  const pinX = inch((minX + maxX) / 2);
  const pinY = inch((minY + maxY) / 2);
  const locPinX = inch(width / 2);
  const locPinY = inch(height / 2);
  const localPoints = points.map((p) => ({
    x: inch(p.x - pinX + locPinX),
    y: inch(p.y - pinY + locPinY),
  }));
  return {
    pinX,
    pinY,
    width,
    height,
    locPinX,
    locPinY,
    localPoints,
    begin: points[0]!,
    end: points[points.length - 1]!,
  };
}

function geometrySection(localPoints: PagePoint[], arcBow?: number): string {
  if (arcBow !== undefined && localPoints.length >= 2) {
    const a = localPoints[0]!;
    const b = localPoints[localPoints.length - 1]!;
    const rows =
      `<Row T="MoveTo" IX="1"><Cell N="X" V="${a.x}"/><Cell N="Y" V="${a.y}"/></Row>` +
      `<Row T="ArcTo" IX="2"><Cell N="X" V="${b.x}"/><Cell N="Y" V="${b.y}"/><Cell N="A" V="${arcBow}"/></Row>`;
    return `<Section N="Geometry" IX="0">${rows}<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
  }
  const rows = localPoints
    .map((p, i) => {
      const t = i === 0 ? "MoveTo" : "LineTo";
      return `<Row T="${t}" IX="${i + 1}"><Cell N="X" V="${p.x}"/><Cell N="Y" V="${p.y}"/></Row>`;
    })
    .join("");
  return `<Section N="Geometry" IX="0">${rows}<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
}

/** Control points of an edge: endpoints plus waypoints (no orthogonal fix-ups). */
export function edgeControlPointsPx(
  edge: PlacedEdge,
  nodeById?: Map<string, PlacedNode>,
): { x: number; y: number }[] {
  const routed = nodeById ? enrichEdgeEndpoints(edge, nodeById) : edge;
  const beginPx = routed.sourcePoint ?? { x: 0, y: 0 };
  const endPx = routed.targetPoint ?? beginPx;
  return dedupePoints([beginPx, ...(routed.waypoints ?? []), endPx]);
}

/** Free-angle edge (straight diagonal polyline or curve), not orthogonalized. */
export function isFreeformEdge(edge: PlacedEdge): boolean {
  return edge.style?.curved === true || edge.style?.straight === true;
}

export function edgePathPx(
  edge: PlacedEdge,
  nodeById?: Map<string, PlacedNode>,
): { x: number; y: number }[] {
  if (isFreeformEdge(edge)) {
    const ctrl = edgeControlPointsPx(edge, nodeById);
    return edge.style?.curved ? curvePathPx(ctrl) : ctrl;
  }
  const routed = nodeById ? enrichEdgeEndpoints(edge, nodeById) : edge;
  const beginPx = routed.sourcePoint ?? { x: 0, y: 0 };
  const endPx = routed.targetPoint ?? beginPx;
  let path: { x: number; y: number }[];
  if (routed.waypoints && routed.waypoints.length > 0) {
    path = dedupePoints([beginPx, ...routed.waypoints, endPx]);
  } else {
    path = dedupePoints(orthogonalPathPx(beginPx, endPx, routed.style?.orthogonal !== false));
  }
  return orthogonalizePathEndpoints(path);
}

export function edgePathPxForDiagram(
  edge: PlacedEdge,
  diagram: Pick<PlacedDiagram, "nodes">,
): { x: number; y: number }[] {
  return edgePathPx(edge, nodeMapFromDiagram(diagram.nodes));
}

export function renderConnector(
  shapeId: number,
  edge: PlacedEdge,
  sourceShapeId: number | undefined,
  targetShapeId: number | undefined,
  pageHeightIn: number,
  labelBackground = "#ffffff",
  arrowSize = 2,
): { xml: string; connects: string[] } {
  const pathPx = edgePathPx(edge);
  const pagePoints = pathPx.map((p) => toPagePx(p.x, p.y, pageHeightIn));
  const layout = layoutConnector(pagePoints);
  // one-bend curve: a true circular arc (ArcTo) through the bend
  const ctrl = edge.style?.curved ? edgeControlPointsPx(edge) : [];
  let arcBow: number | undefined;
  if (ctrl.length === 3) {
    const [a, v, b] = ctrl.map((p) => toPagePx(p.x, p.y, pageHeightIn)) as [
      PagePoint,
      PagePoint,
      PagePoint,
    ];
    // page coordinates are y-up: left of a→b in page space; Visio's bow is
    // positive when the arc lies to the right of begin→end.
    arcBow = inch(
      -arcSagitta({ x: a.x, y: -a.y }, { x: v.x, y: -v.y }, { x: b.x, y: -b.y }) * VISIO_BOW_SIGN,
    );
  }
  const routeExt = edge.style?.curved
    ? `<Cell N="ConLineRouteExt" V="2"/>`
    : edge.style?.straight
      ? `<Cell N="ConLineRouteExt" V="1"/>`
      : "";
  const stroke = edge.style?.stroke ?? "#222222";
  const beginArrow = visioArrow(edge.style?.startArrow ?? "none");
  const endArrow = visioArrow(edge.style?.endArrow ?? "classic");
  const midPx = labelAnchorPx(edge, pathPx);
  const midPage = toPagePx(midPx.x, midPx.y, pageHeightIn);
  const localMid = {
    x: inch(midPage.x - layout.pinX + layout.locPinX),
    y: inch(midPage.y - layout.pinY + layout.locPinY),
  };
  // badge labels are written as their own framed shape (see renderLabelBadge)
  const labelXml =
    edge.label && !edge.labelBox
      ? connectorLabelCells(localMid, edge.label, edge.style, edge.labelAngle)
      : "";

  const triggerBegin =
    sourceShapeId !== undefined
      ? `<Cell N="BegTrigger" V="2" F="_XFTRIGGER(Sheet.${sourceShapeId}!EventXFMod)"/>`
      : "";
  const triggerEnd =
    targetShapeId !== undefined
      ? `<Cell N="EndTrigger" V="2" F="_XFTRIGGER(Sheet.${targetShapeId}!EventXFMod)"/>`
      : "";

  const beginFormula =
    sourceShapeId !== undefined ? ` F="_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)"` : "";
  const endFormula =
    targetShapeId !== undefined ? ` F="_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)"` : "";

  const lineWeight = edge.style?.strokeWidth
    ? `<Cell N="LineWeight" V="${pxToInX(edge.style.strokeWidth)}"/>`
    : "";

  const xml = `<Shape ID="${shapeId}" NameU="Dynamic connector.${shapeId}" Name="Dynamic connector.${shapeId}" Type="Shape" Master="${DYNAMIC_CONNECTOR_MASTER}"><Cell N="PinX" V="${layout.pinX}"/><Cell N="PinY" V="${layout.pinY}"/><Cell N="Width" V="${layout.width}"/><Cell N="Height" V="${layout.height}"/><Cell N="LocPinX" V="${layout.locPinX}"/><Cell N="LocPinY" V="${layout.locPinY}"/><Cell N="BeginX" V="${layout.begin.x}"${beginFormula}/><Cell N="BeginY" V="${layout.begin.y}"${beginFormula}/><Cell N="EndX" V="${layout.end.x}"${endFormula}/><Cell N="EndY" V="${layout.end.y}"${endFormula}/>${triggerBegin}${triggerEnd}<Cell N="ConFixedCode" V="6"/><Cell N="LayerMember" V="0"/><Cell N="FillPattern" V="0"/><Cell N="LineColor" V="${stroke}"/>${lineWeight}${visioLinePattern(edge.style?.dashed)}<Cell N="Rounding" V="0"/>${routeExt}<Cell N="TextBkgnd" V="${labelBackground}"/><Cell N="BeginArrow" V="${beginArrow}"/><Cell N="BeginArrowSize" V="${arrowSize}"/><Cell N="EndArrow" V="${endArrow}"/><Cell N="EndArrowSize" V="${arrowSize}"/>${labelXml}${geometrySection(layout.localPoints, arcBow)}</Shape>`;

  const connects: string[] = [];
  if (sourceShapeId !== undefined) {
    connects.push(`<Connect FromSheet="${shapeId}" FromCell="BeginX" ToSheet="${sourceShapeId}"/>`);
  }
  if (targetShapeId !== undefined) {
    connects.push(`<Connect FromSheet="${shapeId}" FromCell="EndX" ToSheet="${targetShapeId}"/>`);
  }
  return { xml, connects };
}

export { DYNAMIC_CONNECTOR_MASTER };

function labelAnchorPx(
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

export { labelAnchorPx, pathMidpoint };

/**
 * Edge label in a framed (rounded) badge: its own shape on top of the
 * connector, so the frame and fill render the same in Visio and LibreOffice.
 */
export function renderLabelBadge(shapeId: number, edge: PlacedEdge, pageHeightIn: number): string {
  if (!edge.label || !edge.labelBox) return "";
  const fontPx = edge.style?.fontSize ?? 11;
  const anchor = labelAnchorPx(edge, edgePathPx(edge));
  const r = connectorLabelBoxPx(edge.label, anchor, fontPx, edge.style?.bold);
  const box = boxFromPx(r.x, r.y, r.width, r.height, pageHeightIn);
  const lb = edge.labelBox;
  const fill = lb.fill ?? "#ffffff";
  const stroke = lb.stroke ?? edge.style?.stroke ?? "#666666";
  const lw = Math.max(1, (edge.style?.strokeWidth ?? 1) * 0.6);
  const rounding = lb.rounded === false ? 0 : pxToInX(labelBadgeRadiusPx(r.height));
  const style = {
    ...edge.style,
    fontSize: fontPx,
    fontColor: lb.fontColor ?? edge.style?.fontColor ?? stroke,
    align: "center" as const,
  };
  const cells =
    `<Cell N="PinX" V="${box.pinX}"/><Cell N="PinY" V="${box.pinY}"/><Cell N="Width" V="${box.width}"/><Cell N="Height" V="${box.height}"/><Cell N="LocPinX" V="${box.locPinX}"/><Cell N="LocPinY" V="${box.locPinY}"/><Cell N="LayerMember" V="0"/>` +
    `<Cell N="FillForegnd" V="${fill}"/><Cell N="LineColor" V="${stroke}"/><Cell N="LineWeight" V="${pxToInX(lw)}"/><Cell N="Rounding" V="${rounding}"/>` +
    `<Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/><Cell N="VerticalAlign" V="1"/>`;
  const geo = `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
  return `<Shape ID="${shapeId}" NameU="Label.${shapeId}" Name="Label.${shapeId}" LineStyle="0" FillStyle="0" TextStyle="0" Type="Shape">${cells}${charStyle(style)}${geo}${textBlock(edge.label, style)}</Shape>`;
}
