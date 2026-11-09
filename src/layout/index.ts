import { connectorLabelHeightPx, connectorLabelWidthPx } from "../geometry/connector-label.js";
import { pointAlongPath } from "../geometry/path.js";
import { snapRouteEnd } from "../geometry/route-ends.js";
import { parseDrawioImageRef } from "../image/data-uri.js";
import { normalizeEmbeddedImage } from "../image/normalize.js";
import { type Diagram, type DiagramNode, type NodeShape, parseDiagram } from "../schema.js";
import type {
  ArrowKind,
  PlacedDiagram,
  PlacedEdge,
  PlacedImage,
  PlacedNode,
  ShapeKind,
  Style,
} from "../types.js";
import { type ElkExtendedEdge, type ElkNode, elk } from "./elk.js";
import { labelWidthPx, measureCaption, measureShape } from "./measure.js";

type Point = { x: number; y: number };

const FONT_PX = 13;
const EDGE_FONT_PX = 11;
const GROUP_HEADER = 36;
const TITLE_FONT_PX = 20;
const MARGIN = 24;

/** Default colours per shape (draw.io-like pastel palette). */
const SHAPE_COLORS: Record<NodeShape, { fill: string; stroke: string }> = {
  rect: { fill: "#DAE8FC", stroke: "#6C8EBF" },
  roundedRect: { fill: "#DAE8FC", stroke: "#6C8EBF" },
  ellipse: { fill: "#D5E8D4", stroke: "#82B366" },
  circle: { fill: "#D5E8D4", stroke: "#82B366" },
  diamond: { fill: "#FFF2CC", stroke: "#D6B656" },
  cylinder: { fill: "#E1D5E7", stroke: "#9673A6" },
  hexagon: { fill: "#FFE6CC", stroke: "#D79B00" },
  note: { fill: "#FFF2CC", stroke: "#D6B656" },
  actor: { fill: "#FFFFFF", stroke: "#475569" },
  text: { fill: "none", stroke: "none" },
  image: { fill: "none", stroke: "none" },
};

const GROUP_COLORS = [
  { fill: "#F8FAFC", stroke: "#94A3B8" },
  { fill: "#FFF7ED", stroke: "#F59E0B" },
  { fill: "#F0FDF4", stroke: "#22C55E" },
  { fill: "#EFF6FF", stroke: "#3B82F6" },
  { fill: "#FAF5FF", stroke: "#A855F7" },
];

const SHAPE_KIND: Record<NodeShape, ShapeKind> = {
  rect: "rect",
  roundedRect: "roundedRect",
  ellipse: "ellipse",
  circle: "ellipse",
  diamond: "diamond",
  cylinder: "cylinder",
  hexagon: "hexagon",
  note: "note",
  actor: "actor",
  text: "text",
  image: "image",
};

const ELK_DIRECTION = { right: "RIGHT", down: "DOWN", left: "LEFT", up: "UP" } as const;

export interface LayoutOptions {
  /** Override the diagram's direction. */
  direction?: Diagram["direction"];
  /** Space between nodes in the same layer (px). Default 40. */
  nodeSpacing?: number;
  /** Space between layers (px). Default 64. */
  layerSpacing?: number;
}

function shapeOf(node: DiagramNode): NodeShape {
  return node.shape ?? (node.image ? "image" : "roundedRect");
}

/** Pictograms carry their label as a caption below the shape. */
function hasCaption(node: DiagramNode): boolean {
  const shape = shapeOf(node);
  return (shape === "actor" || shape === "image") && Boolean(node.label?.trim());
}

function decodeImage(node: DiagramNode, width: number, height: number): PlacedImage | undefined {
  if (!node.image) return undefined;
  const parsed = parseDrawioImageRef(node.image);
  if (!parsed.ok) {
    const why = parsed.reason === "remote-url" ? "remote URLs are not fetched" : parsed.reason;
    throw new Error(`Node "${node.id}": image must be a PNG/JPEG/SVG data URI (${why})`);
  }
  const normalized = normalizeEmbeddedImage(parsed.mime, parsed.data, width, height);
  if (!normalized) throw new Error(`Node "${node.id}": image data could not be decoded`);
  return normalized;
}

function imageSize(node: DiagramNode): { width: number; height: number } {
  if (node.width && node.height) return { width: node.width, height: node.height };
  const parsed = node.image ? parseDrawioImageRef(node.image) : undefined;
  let ratio = 1;
  if (parsed?.ok) {
    const img = normalizeEmbeddedImage(parsed.mime, parsed.data, 96, 96);
    if (img?.pixelWidth && img.pixelHeight) ratio = img.pixelHeight / img.pixelWidth;
  }
  if (node.width) return { width: node.width, height: Math.round(node.width * ratio) };
  if (node.height) return { width: Math.round(node.height / ratio), height: node.height };
  const base = 96;
  return ratio >= 1
    ? { width: Math.round(base / ratio), height: base }
    : { width: base, height: Math.round(base * ratio) };
}

function nodeStyle(node: DiagramNode, shape: NodeShape): Style {
  const palette = SHAPE_COLORS[shape];
  return {
    fill: node.fill ?? palette.fill,
    stroke: node.stroke ?? palette.stroke,
    fontColor: node.fontColor ?? "#1F2937",
    fontSize: node.fontSize ?? FONT_PX,
    strokeWidth: 1.5,
    align: "center",
    verticalAlign: "middle",
    ...(node.bold ? { bold: true } : {}),
    ...(node.dashed ? { dashed: true } : {}),
  };
}

function arrows(arrow: "end" | "start" | "both" | "none" | undefined): {
  startArrow: ArrowKind;
  endArrow: ArrowKind;
} {
  switch (arrow ?? "end") {
    case "none":
      return { startArrow: "none", endArrow: "none" };
    case "start":
      return { startArrow: "block", endArrow: "none" };
    case "both":
      return { startArrow: "block", endArrow: "block" };
    default:
      return { startArrow: "none", endArrow: "block" };
  }
}

/** Arc-length fraction (0..1) of the point on `path` closest to `p`. */
function projectOnPath(path: Point[], p: Point): number {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const len = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
    lens.push(len);
    total += len;
  }
  if (total < 1e-6) return 0.5;
  let best = Number.POSITIVE_INFINITY;
  let bestAt = 0.5;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = lens[i - 1]!;
    const t =
      len > 0
        ? Math.min(
            1,
            Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)),
          )
        : 0;
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best) {
      best = d;
      bestAt = (walked + t * len) / total;
    }
    walked += len;
  }
  return bestAt;
}

interface Measured {
  node: DiagramNode;
  shape: NodeShape;
  width: number;
  height: number;
  caption?: { width: number; height: number };
}

/**
 * Lay out a vsdx-kit diagram with ELK (layered, orthogonal edge routing,
 * groups as nested containers) and return absolute geometry.
 */
export async function layoutDiagram(
  input: Diagram,
  options: LayoutOptions = {},
): Promise<PlacedDiagram> {
  const diagram = parseDiagram(input);
  const direction = ELK_DIRECTION[options.direction ?? diagram.direction ?? "right"];
  const edgesIn = diagram.edges ?? [];
  const groupsIn = diagram.groups ?? [];

  // 1. Measure nodes.
  const measured = new Map<string, Measured>();
  for (const node of diagram.nodes) {
    const shape = shapeOf(node);
    const fontPx = node.fontSize ?? FONT_PX;
    let size =
      shape === "image"
        ? imageSize(node)
        : measureShape(
            shape,
            hasCaption(node) ? "" : (node.label ?? ""),
            fontPx,
            node.bold ?? false,
          );
    if (shape !== "image") {
      size = { width: node.width ?? size.width, height: node.height ?? size.height };
    }
    const caption = hasCaption(node)
      ? measureCaption(node.label!, fontPx, Math.min(size.width, 60))
      : undefined;
    measured.set(node.id, { node, shape, ...size, caption });
  }

  // 2. Build the ELK graph: groups become compound nodes.
  const nodeSpacing = String(options.nodeSpacing ?? 40);
  const layerSpacing = String(options.layerSpacing ?? 64);
  const root: ElkNode = {
    id: "__root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.json.shapeCoords": "ROOT",
      "elk.json.edgeCoords": "ROOT",
      "elk.spacing.nodeNode": nodeSpacing,
      "elk.layered.spacing.nodeNodeBetweenLayers": layerSpacing,
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.spacing.edgeLabel": "4",
      "elk.spacing.labelNode": "6",
      "elk.edgeLabels.inline": "true",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.padding": `[top=${MARGIN},left=${MARGIN},bottom=${MARGIN},right=${MARGIN}]`,
    },
    children: [],
    edges: [],
  };

  const groupElk = new Map<string, ElkNode>();
  for (const group of groupsIn) {
    const titleW = group.label ? labelWidthPx(group.label, FONT_PX, true) + 32 : 80;
    groupElk.set(group.id, {
      id: `group:${group.id}`,
      layoutOptions: {
        "elk.padding": `[top=${GROUP_HEADER + 12},left=20,bottom=20,right=20]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": `(${Math.ceil(titleW)},${GROUP_HEADER + 40})`,
      },
      children: [],
    });
  }
  // Groups enter the graph where their first member appears, so the model
  // order ELK sees follows the order of the nodes list.
  const attached = new Set<string>();
  const attachGroup = (groupId: string, trail: string[] = []): ElkNode => {
    const own = groupElk.get(groupId)!;
    if (attached.has(groupId)) return own;
    attached.add(groupId);
    const parentId = groupsIn.find((g) => g.id === groupId)?.parent;
    const parent =
      parentId && !trail.includes(parentId) ? attachGroup(parentId, [...trail, groupId]) : root;
    parent.children!.push(own);
    return own;
  };

  for (const item of measured.values()) {
    const elkNode: ElkNode = { id: item.node.id, width: item.width, height: item.height };
    if (item.caption) {
      elkNode.labels = [
        { text: item.node.label!, width: item.caption.width, height: item.caption.height },
      ];
      elkNode.layoutOptions = { "elk.nodeLabels.placement": "OUTSIDE V_BOTTOM H_CENTER" };
    }
    const parent = item.node.group ? attachGroup(item.node.group) : root;
    parent.children!.push(elkNode);
  }
  for (const group of groupsIn) attachGroup(group.id);

  const edgeIds: string[] = [];
  edgesIn.forEach((edge, i) => {
    const id = `edge:${edge.id ?? i + 1}:${i}`;
    edgeIds.push(id);
    const elkEdge: ElkExtendedEdge = { id, sources: [edge.from], targets: [edge.to] };
    if (edge.label?.trim()) {
      const text = edge.label.trim();
      elkEdge.labels = [
        {
          text,
          width: Math.ceil(connectorLabelWidthPx(text, EDGE_FONT_PX)),
          height: Math.ceil(connectorLabelHeightPx(EDGE_FONT_PX)),
        },
      ];
    }
    root.edges!.push(elkEdge);
  });

  const graph = (await (await elk()).layout(root)) as ElkNode;

  // 3. Read absolute geometry back.
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  const edgeResults = new Map<string, ElkExtendedEdge>();
  const walk = (n: ElkNode) => {
    for (const child of n.children ?? []) {
      boxes.set(child.id, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      });
      walk(child);
    }
    for (const e of n.edges ?? []) edgeResults.set(e.id, e as ElkExtendedEdge);
  };
  walk(graph);

  const titleText = diagram.title?.trim();
  const titleH = titleText ? Math.ceil(TITLE_FONT_PX * 1.6) + 12 : 0;
  const dy = titleH;
  const shift = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y + dy) });

  const nodes: PlacedNode[] = [];
  if (titleText) {
    const width = Math.max(
      Math.ceil(labelWidthPx(titleText, TITLE_FONT_PX, true)) + 16,
      (graph.width ?? 0) - MARGIN * 2,
    );
    nodes.push({
      id: "__title",
      kind: "text",
      x: MARGIN,
      y: MARGIN,
      width,
      height: Math.ceil(TITLE_FONT_PX * 1.6),
      label: titleText,
      style: {
        fontColor: "#0F172A",
        fontSize: TITLE_FONT_PX,
        bold: true,
        align: "left",
        verticalAlign: "middle",
        fill: "none",
        stroke: "none",
      },
    });
  }

  groupsIn.forEach((group, index) => {
    const box = boxes.get(`group:${group.id}`);
    if (!box) return;
    const colors = GROUP_COLORS[index % GROUP_COLORS.length]!;
    const p = shift(box);
    nodes.push({
      id: `group:${group.id}`,
      kind: "container",
      x: p.x,
      y: p.y,
      width: Math.round(box.width),
      height: Math.round(box.height),
      label: group.label,
      headerSize: GROUP_HEADER,
      parentId: group.parent ? `group:${group.parent}` : undefined,
      style: {
        fill: group.fill ?? colors.fill,
        stroke: group.stroke ?? colors.stroke,
        fontColor: "#1F2937",
        fontSize: FONT_PX,
        bold: true,
        align: "left",
        verticalAlign: "top",
        strokeWidth: 1.5,
      },
    });
  });

  for (const item of measured.values()) {
    const box = boxes.get(item.node.id);
    if (!box) continue;
    const p = shift(box);
    const style = nodeStyle(item.node, item.shape);
    const placed: PlacedNode = {
      id: item.node.id,
      kind: SHAPE_KIND[item.shape],
      x: p.x,
      y: p.y,
      width: Math.round(box.width),
      height: Math.round(box.height),
      style,
      parentId: item.node.group ? `group:${item.node.group}` : undefined,
    };
    if (item.shape === "image") {
      placed.image = decodeImage(item.node, placed.width, placed.height);
    } else if (!item.caption && item.node.label) {
      placed.label = item.node.label;
    }
    nodes.push(placed);
    if (item.caption) {
      const cw = item.caption.width;
      nodes.push({
        id: `${item.node.id}::caption`,
        kind: "text",
        x: Math.round(p.x + placed.width / 2 - cw / 2),
        y: p.y + placed.height + 6,
        width: cw,
        height: item.caption.height,
        label: item.node.label,
        parentId: placed.parentId,
        style: {
          fontColor: style.fontColor,
          fontSize: style.fontSize,
          bold: style.bold,
          align: "center",
          verticalAlign: "top",
          fill: "none",
          stroke: "none",
        },
      });
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: PlacedEdge[] = [];
  edgesIn.forEach((edge, i) => {
    const id = edgeIds[i]!;
    const result = edgeResults.get(id);
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    const placed: PlacedEdge = {
      id,
      source: edge.from,
      target: edge.to,
      label: edge.label?.trim() || undefined,
      style: {
        stroke: edge.color ?? "#475569",
        strokeWidth: 1.5,
        orthogonal: true,
        ...(edge.dashed ? { dashed: true } : {}),
        ...arrows(edge.arrow),
      },
    };
    const sections = result?.sections ?? [];
    if (sections.length > 0 && source && target) {
      const points: Point[] = [];
      for (const section of sections) {
        points.push(
          shift(section.startPoint),
          ...(section.bendPoints ?? []).map(shift),
          shift(section.endPoint),
        );
      }
      const dedup = points.filter(
        (p, k) => k === 0 || p.x !== points[k - 1]!.x || p.y !== points[k - 1]!.y,
      );
      const start = dedup[0]!;
      const end = dedup[dedup.length - 1]!;
      const bends = dedup.slice(1, -1);
      placed.sourcePoint = snapRouteEnd(source, start, bends[0] ?? end);
      placed.targetPoint = snapRouteEnd(target, end, bends[bends.length - 1] ?? start);
      if (bends.length > 0) placed.waypoints = bends;

      const label = result?.labels?.[0];
      if (placed.label && label && label.x !== undefined && label.y !== undefined) {
        const centre = shift({
          x: label.x + (label.width ?? 0) / 2,
          y: label.y + (label.height ?? 0) / 2,
        });
        const path = [placed.sourcePoint, ...bends, placed.targetPoint];
        const t = projectOnPath(path, centre);
        const base = pointAlongPath(path, t);
        placed.labelRelativeX = Math.round((t * 2 - 1) * 1000) / 1000;
        // keep the label close to its line (ELK may park it beside the route)
        const near = (v: number) => Math.max(-14, Math.min(14, Math.round(v)));
        const off = { x: near(centre.x - base.x), y: near(centre.y - base.y) };
        if (off.x !== 0 || off.y !== 0) placed.labelOffset = off;
      }
    }
    edges.push(placed);
  });

  return {
    title: titleText,
    width: Math.ceil(graph.width ?? 0),
    height: Math.ceil((graph.height ?? 0) + dy),
    nodes,
    edges,
  };
}
