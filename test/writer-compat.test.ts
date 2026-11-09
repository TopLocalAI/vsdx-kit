import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { drawioXmlToPlacedDiagram } from "../src/drawio/read.js";
import { renderSvg } from "../src/preview/render.js";
import type { PlacedDiagram } from "../src/types.js";
import { writeVsdx } from "../src/vsdx/write.js";
import { normalizeHexColor } from "../src/vsdx/xml.js";

async function pageXml(d: PlacedDiagram): Promise<string> {
  const zip = await JSZip.loadAsync(await writeVsdx(d));
  return zip.file("visio/pages/page1.xml")!.async("string");
}

const drawio = `<mxfile><diagram id="d" name="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fc0;strokeColor=#123;fontColor=#f00;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="B" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#abcd;strokeColor=#000;" vertex="1" parent="1"><mxGeometry x="240" y="140" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e" value="lbl" style="html=1;strokeColor=#369;strokeWidth=3;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

describe("writer compatibility", () => {
  it("expands short hex colours to #RRGGBB", async () => {
    expect(normalizeHexColor("#123")).toBe("#112233");
    expect(normalizeHexColor("#abcd")).toBe("#AABBCC");
    expect(normalizeHexColor("#11223344")).toBe("#112233");
    expect(normalizeHexColor("#a1b2c3")).toBe("#a1b2c3");
    const xml = await pageXml(drawioXmlToPlacedDiagram(drawio).diagram);
    expect(xml).not.toMatch(/ V="#[0-9a-fA-F]{3,4}"/);
    expect(xml).toContain('V="#112233"');
    expect(xml).toContain('V="#FFCC00"');
  });

  it("keeps medium arrow heads", async () => {
    const { diagram } = drawioXmlToPlacedDiagram(drawio);
    const xml = await pageXml(diagram);
    expect(xml).toContain('<Cell N="EndArrowSize" V="2"/>');
  });

  it("draws embedded images whose style has no fill/stroke", () => {
    const d: PlacedDiagram = {
      width: 200,
      height: 200,
      nodes: [
        {
          id: "img",
          kind: "image",
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          style: { fill: "none", stroke: "none" },
          image: {
            mime: "image/png",
            data: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
              "base64",
            ),
          },
        },
      ],
      edges: [],
    };
    expect(renderSvg(d)).toContain("<image");
  });
});
