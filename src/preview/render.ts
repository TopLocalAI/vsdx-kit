import { Resvg } from "@resvg/resvg-js";
import { fitDiagramToContent } from "../geometry/content-bounds.js";
import { labelBackgroundAt } from "../geometry/label-background.js";
import type { PlacedDiagram } from "../types.js";
import { edgePathPxForDiagram, labelAnchorPx } from "../vsdx/connectors.js";
import { sortNodesForZOrder } from "../vsdx/shapes.js";
import { resvgFontConfig } from "./font-cache.js";
import {
  arrowMarkerDefs,
  endTangent,
  markerTrimPx,
  renderEdgeLabel,
  renderEndMarker,
  renderNodeShape,
  trimPathEnd,
  trimPathStart,
} from "./shapes.js";
import { n } from "./svg-util.js";
import { diagramNeedsCjk, setActiveFontFamily } from "./text-layout.js";

export interface RenderSvgOptions {
  /** Extra padding around diagram bounds (px). */
  padding?: number;
  /** Skip fitDiagramToContent when the diagram is already fitted. */
  prefit?: boolean;
}

/**
 * Filled arrowhead length for a line width: 7× for thin lines, growing more
 * slowly for thick ones, never below 9px.
 */
export function arrowLengthPx(strokeWidth: number): number {
  return Math.max(9, Math.min(strokeWidth * 7, 8 + strokeWidth * 2.5));
}

export function renderSvg(diagram: PlacedDiagram, opts?: RenderSvgOptions): string {
  setActiveFontFamily(diagramNeedsCjk(diagram));
  const pad = opts?.padding ?? 0;
  const fitted = opts?.prefit ? diagram : fitDiagramToContent(diagram);
  const w = fitted.width + pad * 2;
  const h = fitted.height + pad * 2;
  const offset = pad;

  const sorted = sortNodesForZOrder(fitted.nodes);
  const nodeLayer = sorted
    .map((node) => {
      const shifted = offset
        ? {
            ...node,
            x: node.x + offset,
            y: node.y + offset,
          }
        : node;
      return renderNodeShape(shifted);
    })
    .join("");

  const edgePaths: string[] = [];
  const edgeLabels: string[] = [];

  for (const edge of fitted.edges) {
    const pathPx = edgePathPxForDiagram(edge, fitted);
    const shifted = pathPx.map((p) => ({ x: p.x + offset, y: p.y + offset }));
    if (shifted.length < 2) continue;
    const stroke = edge.style?.stroke ?? "#222222";
    const sw = edge.style?.strokeWidth ?? 1;
    const dash = edge.style?.dashed ? ' stroke-dasharray="4 3"' : "";
    const startArrow = edge.style?.startArrow ?? "none";
    const endArrow = edge.style?.endArrow ?? "classic";
    const arrowLen = arrowLengthPx(sw);
    const tipEnd = shifted[shifted.length - 1]!;
    const tipStart = shifted[0]!;
    let drawPoints = trimPathEnd(shifted, markerTrimPx(endArrow, arrowLen));
    drawPoints = trimPathStart(drawPoints, markerTrimPx(startArrow, arrowLen));
    const d = drawPoints.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ");
    edgePaths.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"${dash}/>`,
    );
    edgePaths.push(renderEndMarker(endArrow, tipEnd, endTangent(shifted), arrowLen, stroke, sw));
    edgePaths.push(
      renderEndMarker(
        startArrow,
        tipStart,
        endTangent(shifted.slice().reverse()),
        arrowLen,
        stroke,
        sw,
      ),
    );
    if (edge.label) {
      const anchor = labelAnchorPx(edge, pathPx);
      edgeLabels.push(
        renderEdgeLabel(
          edge.id,
          { x: anchor.x + offset, y: anchor.y + offset },
          edge.label,
          {
            ...edge.style,
            labelBackground: labelBackgroundAt(fitted.nodes, anchor),
          },
          edge.labelBox,
          edge.labelAngle,
        ),
      );
    }
  }

  const defs = `<defs>${arrowMarkerDefs()}</defs>`;
  const body = `${nodeLayer}${edgePaths.join("")}${edgeLabels.join("")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">${defs}${body}</svg>`;
}

export interface RenderPngOptions {
  /** Output scale factor (2 = retina). Default 1. */
  scale?: number;
  /** Font files to use instead of the bundled Noto Sans SC. */
  fontFiles?: string[];
  /** Background colour; "transparent" for none. Default white. */
  background?: string;
}

export function renderPng(diagram: PlacedDiagram, opts?: RenderPngOptions): Uint8Array {
  const scale = opts?.scale ?? 1;
  const preferCjk = diagramNeedsCjk(diagram);
  setActiveFontFamily(preferCjk);
  const fitted = fitDiagramToContent(diagram);
  const svg = renderSvg(fitted, { prefit: true });
  const resvg = new Resvg(svg, {
    ...(scale === 1
      ? {}
      : {
          fitTo: {
            mode: "width",
            value: Math.max(1, Math.round(fitted.width * scale)),
          },
        }),
    font: resvgFontConfig(opts?.fontFiles, { preferCjk }),
    ...(opts?.background === "transparent" ? {} : { background: opts?.background ?? "#ffffff" }),
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
