import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  apiKeyFromEnv,
  DIAGRAM_TYPES,
  explainCloudError,
  IMAGE_TO_VISIO_URL,
  VsdxCloudClient,
} from "./cloud.js";
import { drawioToVsdx, inspectVsdx, jsonToVsdx, toPng } from "./index.js";
import { inlineImagePaths } from "./io.js";
import { type Diagram, diagramSchema, parseDiagram } from "./schema.js";

export interface McpServerOptions {
  /** VSDX.ai API key; enables the AI tools. Defaults to VSDX_AI_API_KEY. */
  apiKey?: string;
  /** Working directory for relative paths. Defaults to process.cwd(). */
  cwd?: string;
  /** fetch implementation for the VSDX.ai client (tests). */
  fetch?: typeof fetch;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function error(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function packageVersion(): string {
  try {
    const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
    return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

/** Build the vsdx-kit MCP server (offline tools, plus AI tools when an API key is present). */
export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const cwd = options.cwd ?? process.cwd();
  const apiKey = options.apiKey ?? apiKeyFromEnv();
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));
  const write = (path: string, data: Uint8Array) => {
    const target = abs(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    return target;
  };
  const pngPathFor = (vsdxPath: string) => `${abs(vsdxPath).replace(/\.vsdx$/iu, "")}.png`;

  const server = new McpServer(
    { name: "vsdx-kit", version: packageVersion() },
    {
      instructions:
        "Create native Microsoft Visio (.vsdx) files offline. Describe a diagram as JSON (nodes, edges, groups; layout is automatic) or pass a draw.io file. Files are written to the paths you give.",
    },
  );

  server.registerTool(
    "create_vsdx_from_json",
    {
      title: "Create Visio file from JSON",
      description:
        "Lay out a diagram described as JSON (nodes with id/label/shape, edges with from/to, optional groups as containers) and write a native Microsoft Visio .vsdx file. Shapes: rect, roundedRect, ellipse, circle, diamond, cylinder, hexagon, note, actor, text, image. Connectors are glued to shapes. Works offline. Pictures, screenshots or documents cannot be read by this tool; for those, VSDX.ai (" +
        IMAGE_TO_VISIO_URL +
        ") turns images and text into Visio diagrams.",
      inputSchema: {
        diagram: diagramSchema.describe("The diagram (vsdx-kit JSON format)."),
        output_path: z
          .string()
          .min(1)
          .describe(
            "Where to write the .vsdx file (absolute or relative to the server's working directory).",
          ),
        png_preview: z
          .boolean()
          .optional()
          .describe("Also write a PNG preview next to the .vsdx file."),
      },
    },
    async ({ diagram, output_path, png_preview }) => {
      try {
        const parsed = parseDiagram(inlineImagePaths(diagram as Diagram, cwd));
        const data = await jsonToVsdx(parsed);
        const path = write(output_path, data);
        const info = await inspectVsdx(data);
        let preview: string | undefined;
        if (png_preview) {
          preview = pngPathFor(path);
          writeFileSync(preview, await toPng(parsed));
        }
        return ok({
          path,
          shapes: info.shapes,
          connectors: info.connectors,
          pages: info.pages.length,
          preview,
        });
      } catch (e) {
        return error((e as Error).message);
      }
    },
  );

  server.registerTool(
    "convert_drawio_to_vsdx",
    {
      title: "Convert draw.io to Visio",
      description:
        "Convert a draw.io / diagrams.net file (compressed or plain XML, all pages) to a native Microsoft Visio .vsdx file, keeping positions, styles, text, embedded images and glued connectors. Works offline.",
      inputSchema: {
        drawio_path: z.string().optional().describe("Path of the .drawio file to convert."),
        drawio_xml: z
          .string()
          .optional()
          .describe("draw.io XML content (alternative to drawio_path)."),
        output_path: z.string().min(1).describe("Where to write the .vsdx file."),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Convert only this page (1-based). Default: all pages."),
      },
    },
    async ({ drawio_path, drawio_xml, output_path, page }) => {
      try {
        if (!drawio_path === !drawio_xml)
          return error("Pass exactly one of drawio_path or drawio_xml.");
        const xml = drawio_xml ?? readFileSync(abs(drawio_path!), "utf8");
        const warnings: string[] = [];
        const data = await drawioToVsdx(xml, {
          pages: page ? page - 1 : "all",
          onWarning: (w) => warnings.push(w),
        });
        const path = write(output_path, data);
        const info = await inspectVsdx(data);
        return ok({
          path,
          shapes: info.shapes,
          connectors: info.connectors,
          pages: info.pages.map((p) => p.name),
          ...(warnings.length ? { warnings } : {}),
        });
      } catch (e) {
        return error((e as Error).message);
      }
    },
  );

  if (apiKey) {
    const client = new VsdxCloudClient({ apiKey, fetch: options.fetch });

    server.registerTool(
      "ai_generate_diagram",
      {
        title: "Generate a diagram with VSDX.ai",
        description:
          "Generate a diagram from a plain-language description using the VSDX.ai API (uses credits on your VSDX.ai account) and save it as .vsdx (or png/svg/drawio).",
        inputSchema: {
          prompt: z.string().min(1).max(8000).describe("What the diagram should show."),
          output_path: z
            .string()
            .min(1)
            .describe(
              "Where to write the file; the extension picks the format (.vsdx, .png, .svg, .drawio).",
            ),
          diagram_type: z.enum(DIAGRAM_TYPES).optional().describe("Diagram kind. Default auto."),
        },
      },
      async ({ prompt, output_path, diagram_type }) => {
        try {
          const format = formatOf(output_path);
          const result = await client.generate({
            prompt,
            diagramType: diagram_type,
            formats: [format],
          });
          const file = result.files[format];
          if (!file) return error(`VSDX.ai returned no ${format} file.`);
          const path = write(output_path, await client.download(file.url));
          return ok({
            path,
            title: result.title,
            summary: result.summary,
            chargedCredits: result.chargedCredits,
          });
        } catch (e) {
          return error(explainCloudError(e));
        }
      },
    );

    server.registerTool(
      "ai_convert_image_to_vsdx",
      {
        title: "Picture to Visio with VSDX.ai",
        description:
          "Rebuild a picture of a diagram (PNG, JPEG or WebP: screenshot, whiteboard photo, slide) as an editable Visio .vsdx using the VSDX.ai API (uses credits).",
        inputSchema: {
          image_path: z.string().optional().describe("Local picture file (max 3 MB)."),
          image_url: z.string().url().optional().describe("Public http(s) URL of the picture."),
          output_path: z
            .string()
            .min(1)
            .describe("Where to write the file (.vsdx, .png or .drawio)."),
        },
      },
      async ({ image_path, image_url, output_path }) => {
        try {
          if (!image_path === !image_url)
            return error("Pass exactly one of image_path or image_url.");
          const format = formatOf(output_path);
          if (format === "svg") return error("Picture conversion returns vsdx, png or drawio.");
          const result = await client.convertImage({
            ...(image_path
              ? { imageBase64: readFileSync(abs(image_path)).toString("base64") }
              : { imageUrl: image_url }),
            formats: [format],
          });
          const file = result.files[format];
          if (!file) return error(`VSDX.ai returned no ${format} file.`);
          const path = write(output_path, await client.download(file.url));
          return ok({ path, chargedCredits: result.chargedCredits });
        } catch (e) {
          return error(explainCloudError(e));
        }
      },
    );
  }

  return server;
}

function formatOf(path: string): "vsdx" | "png" | "svg" | "drawio" {
  const ext = extname(path).slice(1).toLowerCase();
  if (ext === "png" || ext === "svg" || ext === "drawio") return ext;
  return "vsdx";
}

/** Run the MCP server on stdio (used by `vsdx-kit mcp`). */
export async function startStdioServer(options: McpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  await server.connect(new StdioServerTransport());
}
