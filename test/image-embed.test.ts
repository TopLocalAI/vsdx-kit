import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { drawioXmlToPlacedDiagram } from "../src/drawio/read.js";
import { placedToDrawio } from "../src/drawio/write.js";
import { parseDrawioImageRef } from "../src/image/data-uri.js";
import type { PlacedDiagram } from "../src/types.js";
import { writeVsdx } from "../src/vsdx/write.js";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function tinyPngDiagram(id = "img1"): PlacedDiagram {
  const data = Uint8Array.from(Buffer.from(TINY_PNG_B64, "base64"));
  return {
    width: 200,
    height: 200,
    nodes: [
      {
        id,
        kind: "image",
        x: 40,
        y: 50,
        width: 48,
        height: 48,
        image: { mime: "image/png", data, pixelWidth: 1, pixelHeight: 1 },
      },
    ],
    edges: [],
  };
}

describe("parseDrawioImageRef", () => {
  it("parses data:image/png,<base64> (no ;base64)", () => {
    const ref = `data:image/png,${TINY_PNG_B64}`;
    const parsed = parseDrawioImageRef(ref);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.mime).toBe("image/png");
      expect(parsed.data.length).toBeGreaterThan(0);
    }
  });

  it("parses standard data:image/png;base64,", () => {
    const ref = `data:image/png;base64,${TINY_PNG_B64}`;
    const parsed = parseDrawioImageRef(ref);
    expect(parsed.ok).toBe(true);
  });

  it("rejects remote http(s) URLs", () => {
    const parsed = parseDrawioImageRef("https://example.com/icon.png");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("remote-url");
  });
});

describe("writeVsdx embedded images", () => {
  it("writes media parts, rels, and ForeignData", async () => {
    const bytes = await writeVsdx(tinyPngDiagram());
    const zip = await JSZip.loadAsync(bytes);
    const media = Object.keys(zip.files).filter(
      (p) => p.startsWith("visio/media/") && !p.endsWith("/"),
    );
    expect(media.length).toBe(1);
    const rels = (await zip.file("visio/pages/_rels/page1.xml.rels")?.async("string")) ?? "";
    expect(rels).toContain("relationships/image");
    expect(rels).toContain("../media/image1.png");
    const page = (await zip.file("visio/pages/page1.xml")?.async("string")) ?? "";
    expect(page).toContain('Type="Foreign"');
    expect(page).toContain("<ForeignData");
    expect((page.match(/<ForeignData/g) ?? []).length).toBe(1);
  });

  it("deduplicates identical image blobs", async () => {
    const d: PlacedDiagram = {
      width: 300,
      height: 200,
      nodes: [
        ...tinyPngDiagram("a").nodes,
        { ...tinyPngDiagram("b").nodes[0]!, id: "b", x: 120, y: 50 },
      ],
      edges: [],
    };
    const zip = await JSZip.loadAsync(await writeVsdx(d));
    const media = Object.keys(zip.files).filter(
      (p) => p.startsWith("visio/media/") && !p.endsWith("/"),
    );
    expect(media.length).toBe(1);
    const page = (await zip.file("visio/pages/page1.xml")?.async("string")) ?? "";
    expect((page.match(/<ForeignData/g) ?? []).length).toBe(2);
  });

  it("keeps remote image as placeholder with warning", () => {
    const xml = `<?xml version="1.0"?><mxfile><diagram><mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="i" value="" style="shape=image;image=https://example.com/x.png" vertex="1" parent="1">
        <mxGeometry x="10" y="10" width="40" height="40" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`;
    const { diagram, warnings } = drawioXmlToPlacedDiagram(xml);
    expect(diagram.nodes[0]?.kind).toBe("placeholder");
    expect(warnings.some((w) => w.includes("remote"))).toBe(true);
  });

  it("roundtrips image through placedToDrawio", () => {
    const d = tinyPngDiagram();
    const xml = placedToDrawio(d);
    expect(xml).toContain("shape=image");
    expect(xml).toContain("data:image/png;base64,");
    const { diagram: back } = drawioXmlToPlacedDiagram(xml);
    expect(back.nodes[0]?.kind).toBe("image");
    expect(back.nodes[0]?.image?.data.length).toBe(d.nodes[0]?.image?.data.length);
  });
});
