import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { fitDiagramToContent } from "../src/geometry/content-bounds.js";
import { resvgFontConfig } from "../src/preview/font-cache.js";
import { renderPng, renderSvg } from "../src/preview/render.js";
import type { PlacedDiagram, PlacedEdge, ShapeKind } from "../src/types.js";
import { edgePathPx, labelAnchorPx } from "../src/vsdx/connectors.js";
import { allKindsDiagram, minimalDiagram } from "./fixtures.js";

const KINDS: ShapeKind[] = [
  "rect",
  "roundedRect",
  "diamond",
  "ellipse",
  "cylinder",
  "note",
  "component",
  "actor",
  "container",
  "swimlane",
  "text",
  "placeholder",
];

describe("renderSvg", () => {
  it("includes every shape kind in output", () => {
    const svg = renderSvg(allKindsDiagram);
    for (const kind of KINDS) {
      const node = allKindsDiagram.nodes.find((n) => n.kind === kind);
      const needle =
        kind === "placeholder"
          ? node?.label || node?.placeholderOf || "placeholder"
          : (node?.label ?? kind);
      expect(svg).toContain(needle);
    }
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('stroke-dasharray="4 3"');
  });

  it("rotates swimlane left header text", () => {
    const diagram: PlacedDiagram = {
      width: 400,
      height: 200,
      nodes: [
        {
          id: "lane",
          kind: "swimlane",
          x: 10,
          y: 20,
          width: 300,
          height: 120,
          label: "Ops",
          headerSize: 40,
          headerSide: "left",
          style: { fill: "#DAE8FC" },
        },
      ],
      edges: [],
    };
    const svg = renderSvg(diagram);
    expect(svg).toContain('transform="rotate(-90');
    expect(svg).toContain("Ops");
  });

  it("is deterministic for identical input", () => {
    const a = renderSvg(minimalDiagram);
    const b = renderSvg(minimalDiagram);
    expect(a).toBe(b);
  });

  it("draws connector path from edgePathPx and filled end arrow", () => {
    const fitted = fitDiagramToContent(minimalDiagram);
    const svg = renderSvg(minimalDiagram);
    const edge = fitted.edges[0]!;
    const path = edgePathPx(edge);
    expect(svg).toContain(`M${path[0]!.x.toFixed(3)}`);
    expect(svg).toMatch(/<path d="M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ Z"/);
  });

  it("wraps long Chinese labels within text box", () => {
    const diagram: PlacedDiagram = {
      width: 200,
      height: 80,
      nodes: [
        {
          id: "t",
          kind: "rect",
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          label: "这是一段比较长的中文标签文字",
          style: { fontSize: 12 },
        },
      ],
      edges: [],
    };
    const svg = renderSvg(diagram);
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBeGreaterThan(1);
  });

  it("label anchor matches vsdx labelAnchorPx", () => {
    const edge: PlacedEdge = {
      id: "e",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 100, y: 50 },
      waypoints: [{ x: 100, y: 0 }],
      label: "x",
      labelRelativeX: -0.2,
    };
    const fitted = fitDiagramToContent({
      width: 120,
      height: 60,
      nodes: [],
      edges: [edge],
    });
    const fittedPath = edgePathPx(fitted.edges[0]!);
    const fittedAnchor = labelAnchorPx(fitted.edges[0]!, fittedPath);
    const svg = renderSvg({
      width: 120,
      height: 60,
      nodes: [],
      edges: [edge],
    });
    expect(svg).toContain(`x="${fittedAnchor.x.toFixed(3)}"`);
  });
});

describe("renderPng", () => {
  it("PNG dimensions equal diagram size times scale", () => {
    const scale = 2;
    const fitted = fitDiagramToContent(minimalDiagram);
    const png = renderPng(minimalDiagram, { scale });
    const buf = Buffer.from(png);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(Math.round(fitted.width * scale));
    expect(h).toBe(Math.round(fitted.height * scale));
  });

  it("renders visible Chinese and English labels with explicit fonts", () => {
    const diagram: PlacedDiagram = {
      width: 220,
      height: 70,
      nodes: [
        {
          id: "a",
          kind: "rect",
          x: 10,
          y: 10,
          width: 200,
          height: 50,
          label: "Hello 中文",
          style: { fontSize: 14, fontColor: "#111111", fill: "#ffffff" },
        },
      ],
      edges: [],
    };
    const resvg = new Resvg(renderSvg(diagram), {
      font: resvgFontConfig(undefined, { preferCjk: true }),
    });
    const { pixels, width, height } = resvg.render();
    let dark = 0;
    const y0 = Math.floor(height * 0.35);
    const y1 = Math.floor(height * 0.75);
    for (let y = y0; y < y1; y++) {
      for (let x = Math.floor(width * 0.15); x < Math.floor(width * 0.85); x++) {
        const i = (y * width + x) * 4;
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        if (r < 80 && g < 80 && b < 80) dark += 1;
      }
    }
    expect(dark).toBeGreaterThan(40);
  });
});
