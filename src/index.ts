import { decodeXML } from "entities";
import JSZip from "jszip";
import { type DrawioPageResult, drawioXmlToPages } from "./drawio/read.js";
import { placedToDrawio } from "./drawio/write.js";
import { type LayoutOptions, layoutDiagram } from "./layout/index.js";
import { renderPng, renderSvg } from "./preview/render.js";
import type { Diagram } from "./schema.js";
import type { PlacedDiagram } from "./types.js";
import { writeVsdx } from "./vsdx/write.js";

export type { DrawioImportResult, DrawioPageResult } from "./drawio/read.js";
export { drawioXmlToPages, drawioXmlToPlacedDiagram } from "./drawio/read.js";
export { type DrawioPage, placedToDrawio } from "./drawio/write.js";
export { type LayoutOptions, layoutDiagram } from "./layout/index.js";
export {
  type RenderPngOptions,
  type RenderSvgOptions,
  renderPng,
  renderSvg,
} from "./preview/render.js";
export {
  type Diagram,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  DiagramValidationError,
  diagramJsonSchema,
  diagramSchema,
  NODE_SHAPES,
  type NodeShape,
  parseDiagram,
} from "./schema.js";
export type {
  ArrowKind,
  PlacedDiagram,
  PlacedEdge,
  PlacedImage,
  PlacedNode,
  ShapeKind,
  Style,
} from "./types.js";
export { type VsdxPage, writeVsdx } from "./vsdx/write.js";

/** A diagram, or several diagrams written as pages of one document. */
export type DiagramInput = Diagram | Diagram[];

export interface ConvertOptions extends LayoutOptions {}

export interface DrawioOptions {
  /**
   * Which draw.io pages to convert: "all" (default) or a 0-based page index.
   */
  pages?: "all" | number;
  /** Called with import warnings (unsupported shapes, remote images, …). */
  onWarning?: (message: string) => void;
}

export interface PreviewOptions extends LayoutOptions {
  /** 0-based page to render for multi-page input. Default 0. */
  page?: number;
  /** PNG scale factor. Default 2 for toPng. */
  scale?: number;
  /** PNG background colour or "transparent". Default white. */
  background?: string;
}

function asList(input: DiagramInput): Diagram[] {
  return Array.isArray(input) ? input : [input];
}

/** Lay out every diagram of the input (one per page). */
export async function layoutPages(
  input: DiagramInput,
  options: LayoutOptions = {},
): Promise<{ name?: string; diagram: PlacedDiagram }[]> {
  const pages = [];
  for (const d of asList(input)) {
    pages.push({ name: d.title, diagram: await layoutDiagram(d, options) });
  }
  return pages;
}

function selectDrawioPages(xml: string, options: DrawioOptions): DrawioPageResult[] {
  const pages = drawioXmlToPages(xml);
  const selected =
    options.pages === undefined || options.pages === "all" ? pages : [pages[options.pages]];
  if (selected.some((p) => !p)) {
    throw new Error(`Page ${Number(options.pages) + 1} not found (file has ${pages.length})`);
  }
  for (const page of selected as DrawioPageResult[]) {
    for (const w of page.warnings) options.onWarning?.(`${page.name}: ${w}`);
  }
  return selected as DrawioPageResult[];
}

/**
 * Lay out a JSON diagram (or a list of diagrams → pages) and write a native
 * Visio .vsdx package.
 */
export async function jsonToVsdx(
  input: DiagramInput,
  options: ConvertOptions = {},
): Promise<Uint8Array> {
  return writeVsdx(await layoutPages(input, options));
}

/** Convert draw.io / diagrams.net XML (.drawio, compressed or not) to .vsdx. */
export async function drawioToVsdx(xml: string, options: DrawioOptions = {}): Promise<Uint8Array> {
  const pages = selectDrawioPages(xml, options);
  return writeVsdx(pages.map((p) => ({ name: p.name, diagram: p.diagram })));
}

/** Lay out a JSON diagram and serialize it as an editable draw.io file. */
export async function jsonToDrawio(
  input: DiagramInput,
  options: ConvertOptions = {},
): Promise<string> {
  return placedToDrawio(await layoutPages(input, options));
}

async function previewDiagram(
  source: string | DiagramInput,
  options: PreviewOptions,
): Promise<PlacedDiagram> {
  const page = options.page ?? 0;
  if (typeof source === "string") {
    return selectDrawioPages(source, { pages: page })[0]!.diagram;
  }
  const list = asList(source);
  const d = list[page];
  if (!d) throw new Error(`Page ${page + 1} not found (input has ${list.length})`);
  return layoutDiagram(d, options);
}

/** SVG preview of a JSON diagram or of draw.io XML (pass the XML string). */
export async function toSvg(
  source: string | DiagramInput,
  options: PreviewOptions = {},
): Promise<string> {
  return renderSvg(await previewDiagram(source, options));
}

/** PNG preview of a JSON diagram or of draw.io XML (pass the XML string). */
export async function toPng(
  source: string | DiagramInput,
  options: PreviewOptions = {},
): Promise<Uint8Array> {
  return renderPng(await previewDiagram(source, options), {
    scale: options.scale ?? 2,
    background: options.background,
  });
}

export interface VsdxSummary {
  pages: { name: string; shapes: number; connectors: number; glued: number; images: number }[];
  shapes: number;
  connectors: number;
}

/**
 * Inspect a .vsdx package: page names, shape and connector counts, glued
 * connector ends (Connect rows) and embedded images.
 */
export async function inspectVsdx(data: Uint8Array): Promise<VsdxSummary> {
  const zip = await JSZip.loadAsync(data);
  const pagesXml = (await zip.file("visio/pages/pages.xml")?.async("string")) ?? "";
  const names = [...pagesXml.matchAll(/<Page [^>]*NameU="([^"]*)"/g)].map((m) => decodeXML(m[1]!));
  const pages: VsdxSummary["pages"] = [];
  for (let i = 0; i < names.length; i++) {
    const xml = (await zip.file(`visio/pages/page${i + 1}.xml`)?.async("string")) ?? "";
    const connectors = (xml.match(/NameU="Dynamic connector\./g) ?? []).length;
    pages.push({
      name: names[i]!,
      shapes: (xml.match(/<Shape /g) ?? []).length - connectors,
      connectors,
      glued: (xml.match(/<Connect /g) ?? []).length,
      images: (xml.match(/<ForeignData /g) ?? []).length,
    });
  }
  return {
    pages,
    shapes: pages.reduce((s, p) => s + p.shapes, 0),
    connectors: pages.reduce((s, p) => s + p.connectors, 0),
  };
}

export {
  type CloudConvertResult,
  type CloudFormat,
  type CloudGenerateResult,
  DIAGRAM_TYPES,
  type DiagramType,
  VsdxCloudClient,
  type VsdxCloudClientOptions,
  VsdxCloudError,
} from "./cloud.js";
