import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { drawioXmlToPlacedDiagram, htmlToPlainText } from "../src/drawio/read.js";
import {
  CONTENT_MARGIN_PX,
  contentBounds,
  fitDiagramToContent,
} from "../src/geometry/content-bounds.js";
import {
  defaultExitEntryFractions,
  orthogonalizePathEndpoints,
  orthogonalPathPx,
  pathMidpoint,
  perimeterAnchor,
  pointAlongPath,
} from "../src/geometry/path.js";
import type { PlacedDiagram, PlacedEdge, ShapeKind } from "../src/types.js";
import {
  edgePathPx,
  edgePathPxForDiagram,
  renderConnector,
  visioArrow,
} from "../src/vsdx/connectors.js";
import { ellipseGeometry } from "../src/vsdx/geometry.js";
import { connectorLabelWidthIn, textUnits, visioFontSize } from "../src/vsdx/text.js";
import { inch, pxToInX } from "../src/vsdx/units.js";
import { countConnectsInPageXml, writeVsdx } from "../src/vsdx/write.js";
import { allKindsDiagram, minimalDiagram } from "./fixtures.js";

async function pageXmlFromDiagram(diagram: PlacedDiagram): Promise<string> {
  const bytes = await writeVsdx(diagram);
  const zip = await JSZip.loadAsync(bytes);
  const page = (await zip.file("visio/pages/page1.xml")?.async("string")) ?? "";
  return page;
}

async function pagesMetaFromDiagram(
  diagram: PlacedDiagram,
): Promise<{ pageXml: string; pagesXml: string }> {
  const bytes = await writeVsdx(diagram);
  const zip = await JSZip.loadAsync(bytes);
  const pageXml = (await zip.file("visio/pages/page1.xml")?.async("string")) ?? "";
  const pagesXml = (await zip.file("visio/pages/pages.xml")?.async("string")) ?? "";
  return { pageXml, pagesXml };
}

describe("content bounds and page crop", () => {
  it("contentBounds wraps nodes and margin", () => {
    const diagram: PlacedDiagram = {
      width: 2000,
      height: 2000,
      nodes: [
        { id: "a", kind: "rect", x: 100, y: 80, width: 40, height: 30, label: "A" },
        { id: "b", kind: "rect", x: 200, y: 150, width: 50, height: 40, label: "B" },
      ],
      edges: [],
    };
    const b = contentBounds(diagram);
    expect(b.minX).toBe(100);
    expect(b.minY).toBe(80);
    expect(b.maxX).toBe(250);
    expect(b.maxY).toBe(190);
    const fitted = fitDiagramToContent(diagram);
    expect(fitted.width).toBe(250 - 100 + CONTENT_MARGIN_PX * 2);
    expect(fitted.height).toBe(190 - 80 + CONTENT_MARGIN_PX * 2);
    expect(fitted.nodes[0]?.x).toBe(CONTENT_MARGIN_PX);
    expect(fitted.nodes[0]?.y).toBe(CONTENT_MARGIN_PX);
  });

  it("writeVsdx PageWidth and PageHeight match fitted bounds", async () => {
    const diagram: PlacedDiagram = {
      width: 2000,
      height: 2000,
      nodes: [{ id: "a", kind: "rect", x: 50, y: 60, width: 100, height: 40, label: "A" }],
      edges: [],
    };
    const fitted = fitDiagramToContent(diagram);
    const { pagesXml } = await pagesMetaFromDiagram(diagram);
    const pageWidthIn = inch(pxToInX(fitted.width));
    const pageHeightIn = inch(pxToInX(fitted.height));
    expect(pagesXml).toContain(`<Cell N="PageWidth" V="${pageWidthIn}"`);
    expect(pagesXml).toContain(`<Cell N="PageHeight" V="${pageHeightIn}"`);
  });
});

describe("diamond connector geometry", () => {
  it("orthogonalizePathEndpoints removes diagonal first segment", () => {
    const path = orthogonalizePathEndpoints([
      { x: 100, y: 50 },
      { x: 120, y: 70 },
      { x: 120, y: 200 },
    ]);
    expect(path[0]).toEqual({ x: 100, y: 50 });
    expect(path[1]?.x === path[0]?.x || path[1]?.y === path[0]?.y).toBe(true);
  });
});

describe("writeVsdx minimal sample", () => {
  it("writes valid opc with connectors and geometry", async () => {
    const page = await pageXmlFromDiagram(minimalDiagram);
    expect(page).toContain("Dynamic connector");
    expect(countConnectsInPageXml(page)).toBe(6);
    const connectors = page.match(/Master="4"/g) ?? [];
    expect(connectors.length).toBe(3);
    for (const edgeId of ["6", "7", "8"]) {
      const m = page.match(
        new RegExp(`<Shape ID="${edgeId}"[^>]*Master="4"[^>]*>([\\s\\S]*?)</Shape>`),
      );
      expect(m?.[1]).toContain('Section N="Geometry"');
      expect(m?.[1]).toContain('NoFill" V="1"');
    }
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(page)).not.toThrow();
    expect(page).toContain("&#x8f93;&#x5165;&#x8282;&#x70b9;");
    expect(page).toContain("Rounding");
  });

  it("defaults connector start arrow to none and end to classic", async () => {
    const page = await pageXmlFromDiagram(minimalDiagram);
    const arrows = page.match(/BeginArrow" V="(\d)"/g) ?? [];
    expect(arrows.every((a) => a.includes('"0"'))).toBe(true);
    expect(page).toMatch(/EndArrow" V="4"/);
  });
});

describe("shape geometry", () => {
  it("ellipse geometry uses evaluated inch radii matching width and height", () => {
    const g = ellipseGeometry(1.181102, 0.551181);
    expect(g).toContain('V="0.590551"');
    expect(g).toContain('V="0.275591"');
    expect(g).toContain('F="Height*1"');
  });

  it("renders every shape kind with a geometry section", async () => {
    const page = await pageXmlFromDiagram(allKindsDiagram);
    const kinds: ShapeKind[] = [
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
    for (const kind of kinds) {
      const node = allKindsDiagram.nodes.find((n) => n.kind === kind);
      const needle =
        kind === "placeholder"
          ? node?.label || node?.placeholderOf || "placeholder"
          : (node?.label ?? kind);
      expect(page).toContain(needle);
    }
    expect((page.match(/Section N="Geometry"/g) ?? []).length).toBeGreaterThanOrEqual(kinds.length);
    expect(page.match(/Row T="Ellipse"/)).toBeTruthy();
    expect(page).toContain("Rounding");
  });
});

describe("connectors and paths", () => {
  it("infers perimeter anchors when edge endpoints missing", () => {
    const diagram: PlacedDiagram = {
      width: 400,
      height: 200,
      nodes: [
        { id: "a", kind: "rect", x: 50, y: 50, width: 80, height: 40, label: "A" },
        { id: "b", kind: "cylinder", x: 250, y: 40, width: 90, height: 100, label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b" }],
    };
    const path = edgePathPxForDiagram(diagram.edges[0]!, diagram);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]!.x).toBeCloseTo(130, 0);
    expect(path[0]!.x).not.toBeCloseTo(90, 0);
    expect(path[path.length - 1]!.x).toBeGreaterThanOrEqual(250);
  });

  it("orthogonal path without waypoints uses a right angle", () => {
    const pts = orthogonalPathPx({ x: 0, y: 0 }, { x: 100, y: 80 }, true);
    expect(pts.length).toBe(3);
    expect(pts[1]).toEqual({ x: 100, y: 0 });
  });

  it("edge endpoints use perimeter anchors not centers", () => {
    const box = { x: 100, y: 50, width: 40, height: 20 };
    const toward = { x: 200, y: 50 };
    const p = perimeterAnchor(box, 0.5, 0.5, toward, false);
    expect(p.x).toBeCloseTo(140, 0);
    expect(p.y).toBeCloseTo(57.5, 0);
    expect(p.x).not.toBe(box.x + box.width / 2);
  });

  it("default exit entry picks horizontal side toward target", () => {
    const d = defaultExitEntryFractions(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 200, y: 0, width: 50, height: 40 },
    );
    expect(d).toEqual({ exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 });
  });

  it("connector label width fits short Latin labels on one line", () => {
    expect(connectorLabelWidthIn("Yes", 11)).toBeGreaterThan(0.25);
    expect(textUnits("Yes")).toBe(3);
    expect(textUnits("是")).toBe(2);
  });

  it("vertical swimlane sets headerSide left from draw.io horizontal=0", () => {
    const xml = `<?xml version="1.0"?><mxfile><diagram><mxGraphModel pageWidth="400" pageHeight="300"><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="lane" value="Ops" style="swimlane;horizontal=0;startSize=40;" vertex="1" parent="1"><mxGeometry x="10" y="20" width="300" height="80" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`;
    const { diagram } = drawioXmlToPlacedDiagram(xml);
    const lane = diagram.nodes.find((n) => n.id === "lane");
    expect(lane?.headerSide).toBe("left");
    expect(lane?.headerSize).toBe(40);
  });

  it("edge label relative x places anchor nearer start when negative", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const mid = pointAlongPath(path, 0.5);
    const nearStart = pointAlongPath(path, (-0.55 + 1) / 2);
    expect(nearStart.x).toBeLessThan(mid.x);
  });

  it("edgePathPx includes imported waypoints", () => {
    const edge: PlacedEdge = {
      id: "e",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 10, y: 10 },
      waypoints: [{ x: 5, y: 0 }],
    };
    expect(edgePathPx(edge).length).toBe(4);
  });

  it("label anchor is near path midpoint", () => {
    const mid = pathMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(mid.x).toBeCloseTo(75, 0);
    expect(mid.y).toBeCloseTo(0, 0);
  });

  it("renderConnector places TxtPin cells when labeled", () => {
    const { xml } = renderConnector(
      9,
      {
        id: "e",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 100, y: 100 },
        label: "是",
      },
      1,
      2,
      11,
    );
    expect(xml).toContain("TxtPinX");
    expect(xml).toContain("&#x662f;");
    expect(xml).toContain('BeginArrow" V="0"');
  });

  it("visioArrow maps none and classic", () => {
    expect(visioArrow("none")).toBe("0");
    expect(visioArrow("classic")).toBe("4");
    expect(visioArrow(undefined)).toBe("0");
  });
});

describe("drawio-in", () => {
  it("converts child coordinates to absolute page coords", () => {
    const xml = `<?xml version="1.0"?><mxfile><diagram><mxGraphModel pageWidth="400" pageHeight="300"><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="p" style="container=1;" vertex="1" parent="1"><mxGeometry x="10" y="20" width="200" height="100" as="geometry"/></mxCell>
    <mxCell id="c" value="Hi" vertex="1" parent="p"><mxGeometry x="5" y="6" width="50" height="20" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`;
    const { diagram } = drawioXmlToPlacedDiagram(xml);
    const child = diagram.nodes.find((n) => n.id === "c");
    expect(child?.x).toBe(15);
    expect(child?.y).toBe(26);
  });

  it("htmlToPlainText decodes breaks and entities", () => {
    expect(htmlToPlainText("A&lt;br&gt;B&amp;C")).toBe("A\nB&C");
    expect(htmlToPlainText("x&#xa;y")).toBe("x\ny");
  });

  it("reads edge labels and waypoints", () => {
    const xml = `<?xml version="1.0"?><mxfile><diagram><mxGraphModel pageWidth="400" pageHeight="800"><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="a" vertex="1" parent="1"><mxGeometry x="100" y="100" width="80" height="40" as="geometry"/></mxCell>
    <mxCell id="b" vertex="1" parent="1"><mxGeometry x="100" y="200" width="80" height="40" as="geometry"/></mxCell>
    <mxCell id="e" value="否" edge="1" parent="1" source="a" target="b" style="exitX=0.5;exitY=1;entryX=0.5;entryY=0;edgeStyle=orthogonalEdgeStyle;">
      <mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="140" y="160"/></Array></mxGeometry>
    </mxCell>
    </root></mxGraphModel></diagram></mxfile>`;
    const { diagram } = drawioXmlToPlacedDiagram(xml);
    const edge = diagram.edges[0]!;
    expect(edge.label).toBe("否");
    expect(edge.waypoints).toEqual([{ x: 140, y: 160 }]);
    expect(edge.sourcePoint).toEqual({ x: 140, y: 140 });
    expect(edge.targetPoint).toEqual({ x: 140, y: 200 });
  });
});

describe("text sizing", () => {
  it("maps draw.io 13px to the Visio character size", () => {
    expect(visioFontSize(13)).toBeCloseTo(0.124114, 3);
  });
});
