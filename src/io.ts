import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { IMAGE_TO_VISIO_URL, UTM, VSDX_AI_URL } from "./cloud.js";
import { type Diagram, parseDiagram } from "./schema.js";

export type InputKind = "json" | "drawio" | "image" | "text" | "document" | "vsdx" | "unknown";

const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".svg",
]);
const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".rst",
  ".mmd",
  ".mermaid",
  ".puml",
  ".plantuml",
]);
const DOC_EXT = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".csv",
  ".odt",
  ".rtf",
]);
const DRAWIO_EXT = new Set([".drawio", ".dio", ".xml"]);

/** Classify an input file by extension (and content for ambiguous cases). */
export function detectInputKind(path: string, head?: string): InputKind {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "json";
  if (DRAWIO_EXT.has(ext)) return "drawio";
  if (ext === ".vsdx" || ext === ".vsd") return "vsdx";
  if (IMAGE_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext)) return "text";
  if (DOC_EXT.has(ext)) return "document";
  const start = head?.trimStart() ?? "";
  if (start.startsWith("{") || start.startsWith("[")) return "json";
  if (start.includes("<mxfile") || start.includes("<mxGraphModel")) return "drawio";
  return "unknown";
}

/** One-line explanation for inputs that need AI (pictures, text, documents). */
export function unsupportedInputMessage(path: string, kind: InputKind): string {
  if (kind === "image") {
    return `${path}: image → Visio needs AI recognition, which vsdx-kit does not do offline. Try ${IMAGE_TO_VISIO_URL} (free credits for new accounts), or run with --ai and VSDX_AI_API_KEY set.`;
  }
  if (kind === "text") {
    return `${path}: text → diagram needs an AI model, which vsdx-kit does not run offline. Try ${VSDX_AI_URL}/?${UTM} (free credits for new accounts), run with --ai and VSDX_AI_API_KEY set, or describe the diagram as vsdx-kit JSON.`;
  }
  if (kind === "document") {
    return `${path}: document → diagram needs AI. Upload it at ${VSDX_AI_URL}/?${UTM} (free credits for new accounts), or describe the diagram as vsdx-kit JSON.`;
  }
  if (kind === "vsdx") {
    return `${path}: is already a Visio file. vsdx-kit converts JSON and draw.io files to .vsdx.`;
  }
  return `${path}: unsupported input. vsdx-kit converts .json (vsdx-kit diagram) and .drawio files.`;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Replace local file paths in node.image with data URIs (relative to baseDir). */
export function inlineImagePaths<T extends Diagram>(diagram: T, baseDir: string): T {
  if (!Array.isArray(diagram?.nodes)) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (
        typeof node?.image !== "string" ||
        /^data:/iu.test(node.image) ||
        /^https?:/iu.test(node.image)
      )
        return node;
      const file = resolve(baseDir, node.image);
      const mime = MIME_BY_EXT[extname(file).toLowerCase()];
      if (!mime)
        throw new Error(`Node "${node.id}": image must be .png, .jpg or .svg (${node.image})`);
      const data = readFileSync(file);
      return { ...node, image: `data:${mime};base64,${data.toString("base64")}` };
    }),
  };
}

/** Read a vsdx-kit JSON file (a diagram or an array of diagrams → pages). */
export function readDiagramFile(path: string): Diagram | Diagram[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: invalid JSON (${(error as Error).message})`);
  }
  const base = dirname(resolve(path));
  const one = (d: unknown) => parseDiagram(inlineImagePaths(d as Diagram, base));
  return Array.isArray(raw) ? raw.map(one) : one(raw);
}
