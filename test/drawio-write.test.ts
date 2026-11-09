import { describe, expect, it } from "vitest";
import { drawioXmlToPlacedDiagram } from "../src/drawio/read.js";
import { placedToDrawio } from "../src/drawio/write.js";
import type { PlacedDiagram } from "../src/types.js";
import { allKindsDiagram, minimalDiagram } from "./fixtures.js";

function roundtrip(d: PlacedDiagram) {
  const xml = placedToDrawio(d);
  const { diagram: imported } = drawioXmlToPlacedDiagram(xml);
  // actor / picture labels come back as separate caption text nodes
  const back = { ...imported, nodes: imported.nodes.filter((n) => !n.id.endsWith("::caption")) };
  expect(back.nodes.length).toBe(d.nodes.length);
  expect(back.edges.length).toBe(d.edges.length);
  for (const node of d.nodes) {
    const other = back.nodes.find((n) => n.id === node.id);
    expect(other).toBeDefined();
    expect(other!.x).toBeCloseTo(node.x, 0);
    expect(other!.y).toBeCloseTo(node.y, 0);
    expect(other!.width).toBeCloseTo(node.width, 0);
    expect(other!.height).toBeCloseTo(node.height, 0);
  }
  for (const edge of d.edges) {
    const other = back.edges.find((e) => e.id === edge.id);
    expect(other).toBeDefined();
    if (edge.waypoints) {
      expect(other!.waypoints?.length).toBe(edge.waypoints.length);
      edge.waypoints.forEach((p, i) => {
        expect(other!.waypoints![i]!.x).toBeCloseTo(p.x, 0);
        expect(other!.waypoints![i]!.y).toBeCloseTo(p.y, 0);
      });
    }
  }
}

describe("placedToDrawio", () => {
  it("roundtrips minimal and all-kinds diagrams within 1px", () => {
    roundtrip(minimalDiagram);
    roundtrip(allKindsDiagram);
  });

  it("emits uncompressed mxfile", () => {
    const xml = placedToDrawio(minimalDiagram);
    expect(xml).toContain("<mxfile");
    expect(xml).toContain("<mxGraphModel");
    expect(xml).not.toMatch(/^[A-Za-z0-9+/=]{80,}/m);
  });
});

describe("sortNodesForZOrder", () => {
  it("draws a filled backdrop that encloses containers before them", async () => {
    const { sortNodesForZOrder } = await import("../src/vsdx/shapes.js");
    const frame = {
      id: "frame",
      kind: "roundedRect" as const,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      style: { fill: "#f6f9fa" },
    };
    const cls = { id: "cls", kind: "container" as const, x: 100, y: 100, width: 200, height: 150 };
    const box = { id: "box", kind: "rect" as const, x: 400, y: 100, width: 100, height: 50 };
    expect(sortNodesForZOrder([frame, cls, box]).map((n) => n.id)).toEqual(["frame", "cls", "box"]);
    // without an enclosed container a rect keeps its normal place
    expect(sortNodesForZOrder([box, cls]).map((n) => n.id)).toEqual(["cls", "box"]);
  });
});
