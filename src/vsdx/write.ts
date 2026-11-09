import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fitDiagramToContent } from "../geometry/content-bounds.js";
import { enrichEdgeEndpoints } from "../geometry/edge-endpoints.js";
import { labelBackgroundAt } from "../geometry/label-background.js";
import type { PlacedDiagram } from "../types.js";
import { edgePathPx, labelAnchorPx, renderConnector, renderLabelBadge } from "./connectors.js";
import { collectImageMedia, VsdxMediaRegistry } from "./media.js";
import { renderNode, sortNodesForZOrder } from "./shapes.js";
import { pageHeightInFromDiagram, pxToInX } from "./units.js";
import { escapeXml, normalizeColorCells } from "./xml.js";

/** Static OPC parts (document, master, styles). Resolved from src/vsdx or dist/vsdx. */
const OPC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../assets/opc");

const STATIC_PARTS = [
  "_rels/.rels",
  "docProps/app.xml",
  "docProps/core.xml",
  "docProps/custom.xml",
  "visio/document.xml",
  "visio/_rels/document.xml.rels",
  "visio/masters/masters.xml",
  "visio/masters/master1.xml",
  "visio/masters/_rels/masters.xml.rels",
  "visio/windows.xml",
];

const NS_MAIN = "http://schemas.microsoft.com/office/visio/2012/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_PAGE = "http://schemas.microsoft.com/visio/2010/relationships/page";
const REL_MASTER = "http://schemas.microsoft.com/visio/2010/relationships/master";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

export interface VsdxPage {
  /** Page tab name; defaults to the diagram title or "Page-N". */
  name?: string;
  diagram: PlacedDiagram;
}

interface RenderedPage {
  name: string;
  widthIn: number;
  heightIn: number;
  xml: string;
  media: VsdxMediaRegistry;
}

function renderPage(diagram: PlacedDiagram, name: string): RenderedPage {
  const fitted = fitDiagramToContent(diagram);
  const pageHeightIn = pageHeightInFromDiagram(fitted.height);
  const pageWidthIn = pxToInX(fitted.width);
  const nodeById = new Map(fitted.nodes.map((n) => [n.id, n]));
  const idMap = new Map<string, number>();
  let nextId = 1;
  const assignId = (logicalId: string): number => {
    if (!idMap.has(logicalId)) idMap.set(logicalId, nextId++);
    return idMap.get(logicalId)!;
  };

  const media = new VsdxMediaRegistry();
  collectImageMedia(fitted.nodes, media);

  const shapeXml: string[] = [];
  const connects: string[] = [];

  for (const node of sortNodesForZOrder(fitted.nodes)) {
    shapeXml.push(renderNode(assignId(node.id), node, pageHeightIn, media));
  }

  for (const edge of fitted.edges) {
    const sid = assignId(edge.id);
    const enriched = enrichEdgeEndpoints(edge, nodeById);
    const sourceShapeId = edge.source ? idMap.get(edge.source) : undefined;
    const targetShapeId = edge.target ? idMap.get(edge.target) : undefined;
    const { xml, connects: edgeConnects } = renderConnector(
      sid,
      enriched,
      sourceShapeId,
      targetShapeId,
      pageHeightIn,
      enriched.label
        ? labelBackgroundAt(fitted.nodes, labelAnchorPx(enriched, edgePathPx(enriched)))
        : undefined,
    );
    shapeXml.push(xml);
    connects.push(...edgeConnects);
  }
  // framed label badges sit above every connector
  for (const edge of fitted.edges) {
    if (!edge.label || !edge.labelBox) continue;
    const enriched = enrichEdgeEndpoints(edge, nodeById);
    shapeXml.push(renderLabelBadge(assignId(`${edge.id}__label`), enriched, pageHeightIn));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><PageContents xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><Shapes>${shapeXml.join("")}</Shapes><Connects>${connects.join("")}</Connects></PageContents>`;
  return { name, widthIn: pageWidthIn, heightIn: pageHeightIn, xml, media };
}

function pagesXml(pages: RenderedPage[]): string {
  const entries = pages
    .map((page, i) => {
      const name = escapeXml(page.name);
      return `<Page ID="${i}" NameU="${name}" Name="${name}"><PageSheet><Cell N="PageWidth" V="${page.widthIn}"/><Cell N="PageHeight" V="${page.heightIn}"/><Cell N="PageScale" V="1"/><Cell N="DrawingScale" V="1"/><Section N="Layer"><Row IX="0"><Cell N="Name" V="Background"/><Cell N="Color" V="255"/><Cell N="Status" V="0"/><Cell N="Visible" V="1"/><Cell N="Print" V="1"/><Cell N="Active" V="0"/><Cell N="Lock" V="0"/><Cell N="Snap" V="1"/><Cell N="Glue" V="1"/><Cell N="NameUniv" V="Background"/><Cell N="ColorTrans" V="0"/></Row></Section></PageSheet><Rel r:id="rId${i + 1}"/></Page>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Pages xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${entries}</Pages>`;
}

function pagesRelsXml(count: number): string {
  const rels = Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_PAGE}" Target="page${i + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG_REL}">${rels}</Relationships>`;
}

function pageRelsXml(media: { relId: string; target: string }[]): string {
  const master = `<Relationship Type="${REL_MASTER}" Id="rId1" Target="../masters/master1.xml"/>`;
  const images = media
    .map((m) => `<Relationship Type="${REL_IMAGE}" Id="${m.relId}" Target="${m.target}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG_REL}">${master}${images}</Relationships>`;
}

function contentTypesXml(pageCount: number): string {
  const base = readFileSync(join(OPC_DIR, "[Content_Types].xml"), "utf8");
  const pageOverride = (i: number) =>
    `<Override PartName='/visio/pages/page${i}.xml' ContentType='application/vnd.ms-visio.page+xml' />`;
  const overrides = Array.from({ length: pageCount }, (_, i) => pageOverride(i + 1)).join("");
  return base.replace(pageOverride(1), overrides);
}

/**
 * Write a native Visio (.vsdx) package. Pass one diagram for a single-page
 * drawing, or a list of pages for a multi-page document.
 */
export async function writeVsdx(input: PlacedDiagram | VsdxPage[]): Promise<Uint8Array> {
  const pages: VsdxPage[] = Array.isArray(input) ? input : [{ diagram: input }];
  if (pages.length === 0) throw new Error("writeVsdx: at least one page is required");

  const rendered = pages.map((page, i) =>
    renderPage(page.diagram, page.name?.trim() || page.diagram.title?.trim() || `Page-${i + 1}`),
  );

  // Page names must be unique inside a Visio document.
  const seen = new Map<string, number>();
  for (const page of rendered) {
    const count = seen.get(page.name) ?? 0;
    seen.set(page.name, count + 1);
    if (count > 0) page.name = `${page.name} (${count + 1})`;
  }

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml(rendered.length));
  for (const rel of STATIC_PARTS) {
    zip.file(rel, readFileSync(join(OPC_DIR, rel)));
  }
  zip.file("visio/pages/pages.xml", pagesXml(rendered));
  zip.file("visio/pages/_rels/pages.xml.rels", pagesRelsXml(rendered.length));

  let mediaIndex = 0;
  rendered.forEach((page, i) => {
    const n = i + 1;
    zip.file(`visio/pages/page${n}.xml`, normalizeColorCells(page.xml));
    const rels: { relId: string; target: string }[] = [];
    for (const entry of page.media.allEntries()) {
      mediaIndex += 1;
      const ext = entry.compression === "JPEG" ? "jpeg" : "png";
      const file = `image${mediaIndex}.${ext}`;
      zip.file(`visio/media/${file}`, entry.data);
      rels.push({ relId: entry.relId, target: `../media/${file}` });
    }
    zip.file(`visio/pages/_rels/page${n}.xml.rels`, pageRelsXml(rels));
  });

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function countShapesInPageXml(pageXml: string): number {
  return (pageXml.match(/<Shape /g) ?? []).length;
}

export function countConnectsInPageXml(pageXml: string): number {
  return (pageXml.match(/<Connect /g) ?? []).length;
}
