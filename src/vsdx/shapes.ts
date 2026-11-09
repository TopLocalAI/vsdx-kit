import { isImageNode, nodeTextArea } from "../geometry/text-area.js";
import type { PlacedNode } from "../types.js";
import {
  actorGeometry,
  componentGeometry,
  cylinderGeometry,
  diamondGeometry,
  ellipseGeometry,
  fillStrokeCells,
  hexagonGeometry,
  noteGeometry,
  placeholderGeometry,
  rectGeometry,
  roundedRectExtra,
  swimlaneGeometryLeft,
  swimlaneGeometryTop,
} from "./geometry.js";
import type { VsdxMediaRegistry } from "./media.js";
import {
  charStyle,
  fillOpacity,
  linePattern,
  strokeWeightFromPx,
  swimlaneLeftTextPinCells,
  textAreaPinCells,
  textBlock,
} from "./text.js";
import { boxFromPx, inch, pxToInX, type ShapeBox } from "./units.js";

export function renderNode(
  shapeId: number,
  node: PlacedNode,
  pageHeightIn: number,
  media?: VsdxMediaRegistry,
): string {
  const box = boxFromPx(node.x, node.y, node.width, node.height, pageHeightIn);
  const style = node.style;
  const label = isImageNode(node)
    ? undefined
    : node.kind === "placeholder"
      ? node.label || node.placeholderOf || "unsupported"
      : node.label;
  const headerSide = node.headerSide ?? "top";
  let textXml = "";
  if (label) {
    if (node.kind === "swimlane" && headerSide === "left") {
      textXml =
        swimlaneLeftTextPinCells(box, pxToInX(node.headerSize ?? 30)) +
        charStyle(node.style) +
        textBlock(label, node.style);
    } else {
      const area = nodeTextArea(node);
      if (area) {
        const sub = node.subLabel?.text.trim() ? node.subLabel : undefined;
        textXml =
          textAreaPinCells(node, area, node.style) +
          charStyle(node.style, sub) +
          textBlock(
            label,
            node.style,
            node.textLines,
            sub ? (node.subLines ?? sub.text.split("\n")) : undefined,
          );
      }
    }
  }

  switch (node.kind) {
    case "roundedRect":
      return shapeWrap(
        shapeId,
        node,
        shapeCells(box, style) +
          textXml +
          (node.cornerRadius
            ? roundingCell(node.cornerRadius)
            : roundedRectExtra(box.width, box.height)) +
          rectGeometry(),
      );
    case "diamond":
      return shapeWrap(shapeId, node, shapeCells(box, style) + textXml + diamondGeometry());
    case "ellipse":
      return shapeWrap(
        shapeId,
        node,
        shapeCells(box, style) + textXml + ellipseGeometry(box.width, box.height),
      );
    case "cylinder":
      return shapeWrap(
        shapeId,
        node,
        shapeCells(box, style) + textXml + cylinderGeometry(box.width, box.height),
      );
    case "hexagon":
      return shapeWrap(shapeId, node, shapeCells(box, style) + textXml + hexagonGeometry());
    case "note":
      return shapeWrap(shapeId, node, shapeCells(box, style) + textXml + noteGeometry());
    case "component":
      return shapeWrap(shapeId, node, shapeCells(box, style) + textXml + componentGeometry());
    case "actor":
      return shapeWrap(
        shapeId,
        node,
        shapeCells(box, style) + textXml + actorGeometry(box.width, box.height),
      );
    case "container":
      return shapeWrap(
        shapeId,
        node,
        containerCells(box, style) +
          textXml +
          (node.cornerRadius ? roundingCell(node.cornerRadius) : "") +
          rectGeometry(),
      );
    case "swimlane": {
      const header = node.headerSize ?? 30;
      if (headerSide === "left") {
        const wf = header / node.width;
        return shapeWrap(
          shapeId,
          node,
          swimlaneCells(box, style) + textXml + swimlaneGeometryLeft(wf),
        );
      }
      const hf = header / node.height;
      return shapeWrap(
        shapeId,
        node,
        swimlaneCells(box, style) + textXml + swimlaneGeometryTop(hf),
      );
    }
    case "text":
      return shapeWrap(shapeId, node, textOnlyCells(box) + textXml + rectGeometry());
    case "placeholder":
      return shapeWrap(
        shapeId,
        { ...node, style: { ...style, dashed: true } },
        `${placeholderCells(box, style)}<Cell N="LinePattern" V="2"/>${textXml}${placeholderGeometry()}`,
      );
    case "image":
      return renderForeignImage(shapeId, node, box, media, textXml);
    default:
      return shapeWrap(shapeId, node, shapeCells(box, style) + textXml + rectGeometry());
  }
}

const SHAPE_CHILD =
  /<Cell\b[^>]*\/>|<Cell\b[^>]*>[\s\S]*?<\/Cell>|<Section\b[\s\S]*?<\/Section>|<Text>[\s\S]*?<\/Text>|<ForeignData\b[\s\S]*?<\/ForeignData>/g;

/** Order shape children as the VSDX schema expects: Cells, Sections, Text, ForeignData. */
export function orderShapeChildren(inner: string): string {
  const buckets: string[][] = [[], [], [], []];
  for (const m of inner.match(SHAPE_CHILD) ?? []) {
    const idx = m.startsWith("<Cell")
      ? 0
      : m.startsWith("<Section")
        ? 1
        : m.startsWith("<Text")
          ? 2
          : 3;
    buckets[idx]!.push(m);
  }
  return buckets.map((b) => b.join("")).join("");
}

function shapeWrap(shapeId: number, _node: PlacedNode, inner: string): string {
  return `<Shape ID="${shapeId}" NameU="Shape${shapeId}" LineStyle="0" FillStyle="0" TextStyle="0" Type="Shape">${orderShapeChildren(inner)}</Shape>`;
}

function foreignWrap(shapeId: number, inner: string): string {
  return `<Shape ID="${shapeId}" NameU="Shape${shapeId}" LineStyle="0" FillStyle="0" TextStyle="0" Type="Foreign">${orderShapeChildren(inner)}</Shape>`;
}

function renderForeignImage(
  shapeId: number,
  node: PlacedNode,
  box: ShapeBox,
  media: VsdxMediaRegistry | undefined,
  textXml: string,
): string {
  if (!node.image || !media) {
    return shapeWrap(
      shapeId,
      { ...node, kind: "placeholder", style: { ...node.style, dashed: true } },
      `${placeholderCells(box, node.style)}<Cell N="LinePattern" V="2"/>${textXml}${placeholderGeometry()}`,
    );
  }
  const relId = media.lookupRelId(node.image.data);
  if (!relId) {
    return shapeWrap(
      shapeId,
      { ...node, kind: "placeholder", style: { ...node.style, dashed: true } },
      `${placeholderCells(box, node.style)}<Cell N="LinePattern" V="2"/>${textXml}${placeholderGeometry()}`,
    );
  }
  const compression = media.compressionForRel(relId);
  const imgW = box.width;
  const imgH = box.height;
  // The bitmap fills the shape: no offset inside it (Visio shifts the image
  // by these amounts otherwise).
  const imgOffsetX = 0;
  const imgOffsetY = 0;
  let angleCell = "";
  if (node.rotation) {
    angleCell = `<Cell N="Angle" V="${inch((node.rotation * Math.PI) / 180)}"/>`;
  }
  let flipCells = "";
  if (node.flipH) flipCells += '<Cell N="FlipX" V="1"/>';
  if (node.flipV) flipCells += '<Cell N="FlipY" V="1"/>';
  const inner =
    `${pinCells(box)}` +
    `<Cell N="ImgWidth" V="${imgW}"/><Cell N="ImgHeight" V="${imgH}"/>` +
    `<Cell N="ImgOffsetX" V="${imgOffsetX}"/><Cell N="ImgOffsetY" V="${imgOffsetY}"/>` +
    // Pictures have no frame; without this the default line style draws one.
    `<Cell N="LinePattern" V="0"/><Cell N="FillPattern" V="0"/>` +
    angleCell +
    flipCells +
    textXml +
    `<ForeignData ForeignType="Bitmap" CompressionType="${compression}"><Rel r:id="${relId}"/></ForeignData>`;
  return foreignWrap(shapeId, inner);
}

function shapeCells(box: ShapeBox, style: PlacedNode["style"]): string {
  return (
    pinCells(box) +
    fillStrokeCells(style) +
    fillOpacity(style?.opacity) +
    linePattern(style?.dashed) +
    strokeWeightFromPx(style?.strokeWidth)
  );
}

/** Visio corner rounding for a radius in page px. */
function roundingCell(radiusPx: number): string {
  return `<Cell N="Rounding" V="${pxToInX(radiusPx)}"/>`;
}

function containerCells(box: ShapeBox, style: PlacedNode["style"]): string {
  return (
    pinCells(box) +
    fillStrokeCells(style, "#ffffff") +
    fillOpacity(style?.opacity ?? 45) +
    linePattern(style?.dashed)
  );
}

function swimlaneCells(box: ShapeBox, style: PlacedNode["style"]): string {
  return containerCells(box, style);
}

function textOnlyCells(box: ShapeBox): string {
  return `${pinCells(box)}<Cell N="FillPattern" V="0"/><Cell N="LinePattern" V="0"/>`;
}

function placeholderCells(box: ShapeBox, style: PlacedNode["style"]): string {
  return pinCells(box) + fillStrokeCells(style, "#ffffff");
}

function pinCells(box: ShapeBox): string {
  return `<Cell N="PinX" V="${box.pinX}"/><Cell N="PinY" V="${box.pinY}"/><Cell N="Width" V="${box.width}"/><Cell N="Height" V="${box.height}"/><Cell N="LocPinX" V="${box.locPinX}"/><Cell N="LocPinY" V="${box.locPinY}"/><Cell N="LayerMember" V="0"/>`;
}

/** Containers (largest first), then background pictures, then everything else in order. */
export function sortNodesForZOrder(nodes: PlacedNode[]): PlacedNode[] {
  const isContainer = (n: PlacedNode) => n.kind === "container" || n.kind === "swimlane";
  const containers0 = nodes.filter(isContainer);
  // A plain filled shape that encloses a container (e.g. a page frame drawn
  // as a rounded rect around a group) is a backdrop too: drawn after the
  // containers it would hide them.
  const encloses = (a: PlacedNode, b: PlacedNode) =>
    a !== b &&
    a.width * a.height > b.width * b.height &&
    a.x <= b.x + 0.5 &&
    a.y <= b.y + 0.5 &&
    a.x + a.width >= b.x + b.width - 0.5 &&
    a.y + a.height >= b.y + b.height - 0.5;
  const isBackdrop = (n: PlacedNode) =>
    !isContainer(n) &&
    !n.background &&
    n.kind !== "image" &&
    n.kind !== "text" &&
    n.style?.fill !== "none" &&
    containers0.some((c) => encloses(n, c));
  const isArea = (n: PlacedNode) => isContainer(n) || isBackdrop(n);
  const containers = nodes.filter(isArea);
  const backgrounds = nodes.filter((n) => !isArea(n) && n.background);
  const others = nodes.filter((n) => !isArea(n) && !n.background);
  const byArea = (a: PlacedNode, b: PlacedNode) => b.width * b.height - a.width * a.height;
  return [...containers.sort(byArea), ...backgrounds, ...others];
}
