import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { defaultExitEntryFractions } from "../src/geometry/path.js";
import {
  type Diagram,
  DiagramValidationError,
  diagramJsonSchema,
  drawioToVsdx,
  drawioXmlToPages,
  inspectVsdx,
  jsonToDrawio,
  jsonToVsdx,
  layoutDiagram,
  toPng,
  toSvg,
} from "../src/index.js";
import { TINY_PNG_B64, unzip } from "./helpers.js";

const root = join(fileURLToPath(import.meta.url), "../..");
const example = (name: string) => readFileSync(join(root, "examples", name), "utf8");

const flow: Diagram = {
  title: "订单流程 Order flow",
  nodes: [
    { id: "a", label: "开始", shape: "ellipse" },
    { id: "b", label: "检查库存" },
    { id: "c", label: "有货？", shape: "diamond" },
    { id: "d", label: "发货", group: "wh" },
    { id: "e", label: "Notify", shape: "note" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d", label: "是" },
    { from: "c", to: "e", label: "否", dashed: true },
  ],
  groups: [{ id: "wh", label: "仓库 Warehouse" }],
};

describe("jsonToVsdx", () => {
  it("writes a valid OPC package with content types, page and glued connectors", async () => {
    const vsdx = await jsonToVsdx(flow);
    const { files, text } = await unzip(vsdx);
    expect(files).toContain("[Content_Types].xml");
    expect(files).toContain("visio/document.xml");
    expect(files).toContain("visio/pages/pages.xml");
    expect(files).toContain("visio/pages/page1.xml");
    expect(files).toContain("visio/masters/master1.xml");
    const types = await text("[Content_Types].xml");
    expect(types).toContain("/visio/pages/page1.xml");
    const page = await text("visio/pages/page1.xml");
    expect(() => new XMLParser().parse(page)).not.toThrow();
    // every edge is a dynamic connector glued at both ends
    expect((page.match(/NameU="Dynamic connector\./g) ?? []).length).toBe(4);
    expect((page.match(/<Connect /g) ?? []).length).toBe(8);
    expect(page).toContain('FromCell="BeginX"');
    expect(page).toContain('FromCell="EndX"');
    expect(page).toContain("_WALKGLUE");
  });

  it("preserves CJK text (as XML character references)", async () => {
    const page = await (await unzip(await jsonToVsdx(flow))).text("visio/pages/page1.xml");
    const decoded = page.replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    );
    for (const s of ["开始", "检查库存", "有货？", "仓库 Warehouse", "是", "否"]) {
      expect(decoded).toContain(s);
    }
  });

  it("names the page after the title", async () => {
    const info = await inspectVsdx(await jsonToVsdx(flow));
    expect(info.pages[0]!.name).toBe("订单流程 Order flow");
    expect(info.connectors).toBe(4);
    // 5 nodes + 1 container + title
    expect(info.shapes).toBe(7);
  });

  it("embeds images as ForeignData with media parts", async () => {
    const d: Diagram = {
      nodes: [
        { id: "i", label: "Logo", shape: "image", image: `data:image/png;base64,${TINY_PNG_B64}` },
        { id: "j", label: "Box" },
      ],
      edges: [{ from: "i", to: "j" }],
    };
    const { files, text } = await unzip(await jsonToVsdx(d));
    expect(files.filter((f) => f.startsWith("visio/media/"))).toEqual(["visio/media/image1.png"]);
    const page = await text("visio/pages/page1.xml");
    expect(page).toContain("<ForeignData");
    expect(page).toContain('Type="Foreign"');
    expect(await text("visio/pages/_rels/page1.xml.rels")).toContain("../media/image1.png");
  });

  it("writes one Visio page per diagram for an array input", async () => {
    const pages = JSON.parse(example("multi-page.json")) as Diagram[];
    const vsdx = await jsonToVsdx(pages);
    const info = await inspectVsdx(vsdx);
    expect(info.pages.map((p) => p.name)).toEqual(["Overview", "State machine"]);
    const { files, text } = await unzip(vsdx);
    expect(files).toContain("visio/pages/page2.xml");
    expect(files).toContain("visio/pages/_rels/page2.xml.rels");
    expect(await text("[Content_Types].xml")).toContain("/visio/pages/page2.xml");
    expect(await text("visio/pages/_rels/pages.xml.rels")).toContain('Target="page2.xml"');
  });

  it("rejects invalid diagrams with readable issues", async () => {
    await expect(
      jsonToVsdx({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "zzz" }] } as Diagram),
    ).rejects.toThrow(DiagramValidationError);
    await expect(jsonToVsdx({ nodes: [] } as unknown as Diagram)).rejects.toThrow(/nodes/);
  });
});

describe("layout", () => {
  it("places nodes without overlaps and routes orthogonal edges", async () => {
    const placed = await layoutDiagram(flow);
    const shapes = placed.nodes.filter((n) => n.kind !== "container" && n.kind !== "text");
    for (const a of shapes) {
      for (const b of shapes) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
    }
    for (const e of placed.edges) {
      const pts = [e.sourcePoint!, ...(e.waypoints ?? []), e.targetPoint!];
      for (let i = 1; i < pts.length; i++) {
        const straight =
          Math.abs(pts[i]!.x - pts[i - 1]!.x) < 1 || Math.abs(pts[i]!.y - pts[i - 1]!.y) < 1;
        expect(straight, e.id).toBe(true);
      }
    }
  });

  it("keeps group members inside their container", async () => {
    const placed = await layoutDiagram(flow);
    const group = placed.nodes.find((n) => n.id === "group:wh")!;
    const member = placed.nodes.find((n) => n.id === "d")!;
    expect(member.x).toBeGreaterThanOrEqual(group.x);
    expect(member.y).toBeGreaterThan(group.y);
    expect(member.x + member.width).toBeLessThanOrEqual(group.x + group.width);
    expect(member.y + member.height).toBeLessThanOrEqual(group.y + group.height);
  });

  it("flows down when direction is down", async () => {
    const placed = await layoutDiagram({
      ...flow,
      direction: "down",
      groups: [],
      nodes: flow.nodes.map(({ group, ...n }) => n),
    });
    const a = placed.nodes.find((n) => n.id === "a")!;
    const b = placed.nodes.find((n) => n.id === "b")!;
    expect(b.y).toBeGreaterThan(a.y + a.height);
  });
});

describe("draw.io", () => {
  it("converts a plain draw.io file keeping shape and connector counts", async () => {
    const xml = example("network-zh.drawio");
    const [page] = drawioXmlToPages(xml);
    const info = await inspectVsdx(await drawioToVsdx(xml));
    expect(info.pages[0]!.name).toBe("网络拓扑");
    expect(info.shapes).toBe(page!.diagram.nodes.length);
    expect(info.connectors).toBe(page!.diagram.edges.length);
    expect(info.pages[0]!.glued).toBe(page!.diagram.edges.length * 2);
  });

  it("reads every page of a compressed multi-page file, with embedded images", async () => {
    const xml = example("two-pages-compressed.drawio");
    const pages = drawioXmlToPages(xml);
    expect(pages.map((p) => p.name)).toEqual(["Icons", "Workflow"]);
    expect(pages[1]!.diagram.nodes.find((n) => n.id === "d")?.label).toBe("Archive");
    const info = await inspectVsdx(await drawioToVsdx(xml));
    expect(info.pages.map((p) => p.connectors)).toEqual([1, 3]);
    expect(info.pages[0]!.images).toBe(2);
    const first = await inspectVsdx(await drawioToVsdx(xml, { pages: 1 }));
    expect(first.pages.map((p) => p.name)).toEqual(["Workflow"]);
  });

  it("round-trips JSON → draw.io → vsdx with the same counts", async () => {
    const drawio = await jsonToDrawio(flow);
    expect(drawio).toContain("<mxfile");
    const direct = await inspectVsdx(await jsonToVsdx(flow));
    const via = await inspectVsdx(await drawioToVsdx(drawio));
    expect(via.connectors).toBe(direct.connectors);
    expect(via.shapes).toBe(direct.shapes);
    expect(via.pages[0]!.glued).toBe(direct.pages[0]!.glued);
  });

  it("enters a target on the side facing the source", () => {
    const left = { x: 0, y: 0, width: 100, height: 50 };
    const right = { x: 300, y: 10, width: 100, height: 50 };
    expect(defaultExitEntryFractions(left, right)).toMatchObject({ exitX: 1, entryX: 0 });
    expect(defaultExitEntryFractions(right, left)).toMatchObject({ exitX: 0, entryX: 1 });
  });
});

describe("previews", () => {
  it("renders SVG and PNG for JSON and draw.io input", async () => {
    const svg = await toSvg(flow);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("检查库存");
    const png = await toPng(example("network-zh.drawio"), { scale: 1 });
    expect(Buffer.from(png.subarray(1, 4)).toString()).toBe("PNG");
  });
});

describe("JSON Schema", () => {
  it("matches the committed schema file", () => {
    const committed = JSON.parse(readFileSync(join(root, "schema/diagram.schema.json"), "utf8"));
    expect(committed).toEqual(diagramJsonSchema());
  });
});
