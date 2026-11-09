#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  API_KEYS_URL,
  apiKeyFromEnv,
  type CloudFormat,
  DIAGRAM_TYPES,
  type DiagramType,
  explainCloudError,
  VsdxCloudClient,
} from "./cloud.js";
import {
  diagramJsonSchema,
  drawioToVsdx,
  inspectVsdx,
  jsonToDrawio,
  jsonToVsdx,
  toPng,
  toSvg,
} from "./index.js";
import { detectInputKind, type InputKind, readDiagramFile, unsupportedInputMessage } from "./io.js";

const FORMATS = ["vsdx", "png", "svg", "drawio"] as const;
type Format = (typeof FORMATS)[number];

function version(): string {
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}

const HELP = `vsdx-kit — native Microsoft Visio (.vsdx) files from JSON or draw.io, offline.

Usage
  vsdx-kit convert <input.json|input.drawio> [-o out.vsdx] [--format vsdx|png|svg|drawio]
  vsdx-kit preview <input.json|input.drawio> [-o out.png]
  vsdx-kit inspect <file.vsdx>
  vsdx-kit schema                      Print the JSON Schema of the diagram format
  vsdx-kit mcp                         Start a local MCP server (stdio)
  vsdx-kit generate "<prompt>" -o out.vsdx      AI, needs VSDX_AI_API_KEY

Options
  -o, --output <file>     Output file (format from extension unless --format is given)
  -f, --format <fmt>      vsdx (default), png, svg or drawio
      --page <n>          draw.io / multi-page input: only page n (1-based)
      --direction <dir>   JSON input: right, down, left or up (overrides the file)
      --scale <n>         PNG scale factor (default 2)
      --ai                Use the VSDX.ai API for pictures and text (needs VSDX_AI_API_KEY)
      --type <kind>       --ai/generate: ${DIAGRAM_TYPES.join(", ")}
  -h, --help              Show help
  -v, --version           Show version

Examples
  npx vsdx-kit convert flow.json -o flow.vsdx
  npx vsdx-kit convert diagram.drawio                # → diagram.vsdx
  npx vsdx-kit preview flow.json -o flow.png
  VSDX_AI_API_KEY=… npx vsdx-kit convert whiteboard.jpg --ai -o whiteboard.vsdx

Docs: https://github.com/TopLocalAI/vsdx-kit`;

class UsageError extends Error {}

function fail(message: string, code = 1): never {
  process.stderr.write(`vsdx-kit: ${message}\n`);
  process.exit(code);
}

function writeOut(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, data);
}

function formatFor(
  output: string | undefined,
  explicit: string | undefined,
  fallback: Format,
): Format {
  if (explicit) {
    if (!(FORMATS as readonly string[]).includes(explicit)) {
      throw new UsageError(`unknown format "${explicit}" (use ${FORMATS.join(", ")})`);
    }
    return explicit as Format;
  }
  const ext = output ? extname(output).slice(1).toLowerCase() : "";
  if (ext === "dio" || ext === "xml") return "drawio";
  return (FORMATS as readonly string[]).includes(ext) ? (ext as Format) : fallback;
}

function defaultOutput(input: string, format: Format): string {
  const stem = basename(input, extname(input));
  return resolve(dirname(input), `${stem}.${format}`);
}

function pageIndex(page: string | undefined): number | undefined {
  if (page === undefined) return undefined;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) throw new UsageError("--page must be a positive integer");
  return n - 1;
}

interface Opts {
  output?: string;
  format?: string;
  page?: string;
  direction?: string;
  scale?: string;
  ai?: boolean;
  type?: string;
}

async function render(input: string, format: Format, opts: Opts): Promise<Uint8Array | string> {
  const head = readFileSync(input, "utf8").slice(0, 2048);
  const kind = detectInputKind(input, head);
  const page = pageIndex(opts.page);
  const scale = opts.scale ? Number(opts.scale) : undefined;
  if (scale !== undefined && !(scale > 0 && scale <= 8))
    throw new UsageError("--scale must be between 0 and 8");
  const direction = opts.direction as "right" | "down" | "left" | "up" | undefined;
  if (direction && !["right", "down", "left", "up"].includes(direction)) {
    throw new UsageError("--direction must be right, down, left or up");
  }

  if (kind === "drawio") {
    const xml = readFileSync(input, "utf8");
    const onWarning = (w: string) => process.stderr.write(`warning: ${w}\n`);
    if (format === "vsdx") return drawioToVsdx(xml, { pages: page ?? "all", onWarning });
    if (format === "svg") return toSvg(xml, { page });
    if (format === "png") return toPng(xml, { page, scale });
    throw new UsageError("input is already draw.io; choose vsdx, png or svg");
  }
  if (kind === "json") {
    const diagram = readDiagramFile(input);
    const selected =
      page === undefined
        ? diagram
        : Array.isArray(diagram)
          ? diagram[page]
          : page === 0
            ? diagram
            : undefined;
    if (!selected) throw new UsageError(`page ${Number(opts.page)} not found`);
    if (format === "vsdx") return jsonToVsdx(selected, { direction });
    if (format === "drawio") return jsonToDrawio(selected, { direction });
    if (format === "svg") return toSvg(selected, { direction });
    return toPng(selected, { direction, scale });
  }
  throw new UnsupportedInput(unsupportedInputMessage(input, kind), kind);
}

class UnsupportedInput extends Error {
  constructor(
    message: string,
    readonly kind: InputKind,
  ) {
    super(message);
  }
}

function cloudClient(): VsdxCloudClient {
  const apiKey = apiKeyFromEnv();
  if (!apiKey) {
    fail(`--ai needs an API key in VSDX_AI_API_KEY. Create one at ${API_KEYS_URL}`, 2);
  }
  return new VsdxCloudClient({ apiKey });
}

function diagramType(type: string | undefined): DiagramType | undefined {
  if (!type) return undefined;
  if (!(DIAGRAM_TYPES as readonly string[]).includes(type)) {
    throw new UsageError(`--type must be one of ${DIAGRAM_TYPES.join(", ")}`);
  }
  return type as DiagramType;
}

async function saveCloudFile(
  client: VsdxCloudClient,
  files: Partial<Record<CloudFormat, { url: string }>>,
  format: Format,
  output: string,
  charged: number,
): Promise<void> {
  const file = files[format];
  if (!file) throw new Error(`VSDX.ai did not return a ${format} file`);
  writeOut(output, await client.download(file.url));
  process.stderr.write(`VSDX.ai: ${charged} credits used\n`);
  process.stdout.write(`${output}\n`);
}

async function aiConvert(input: string, kind: InputKind, opts: Opts): Promise<void> {
  const format = formatFor(opts.output, opts.format, "vsdx");
  const output = opts.output ?? defaultOutput(input, format);
  if (kind === "image") {
    if (format === "svg") throw new UsageError("picture conversion returns vsdx, png or drawio");
    const ext = extname(input).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      throw new UsageError("VSDX.ai accepts PNG, JPEG or WebP pictures");
    }
    const bytes = readFileSync(input);
    if (bytes.length > 3 * 1024 * 1024) {
      throw new UsageError("picture is larger than 3 MB; upload it at https://vsdx.ai instead");
    }
    const client = cloudClient();
    const result = await client.convertImage({
      imageBase64: bytes.toString("base64"),
      formats: [format as "vsdx" | "png" | "drawio"],
    });
    return saveCloudFile(client, result.files, format, output, result.chargedCredits);
  }
  if (kind === "text") {
    const prompt = readFileSync(input, "utf8").trim();
    return aiGenerate(prompt, { ...opts, output });
  }
  throw new UnsupportedInput(unsupportedInputMessage(input, kind), kind);
}

async function aiGenerate(prompt: string, opts: Opts): Promise<void> {
  if (!prompt) throw new UsageError("the prompt is empty");
  if (prompt.length > 8000) throw new UsageError("the prompt is longer than 8000 characters");
  const format = formatFor(opts.output, opts.format, "vsdx");
  const output = opts.output ?? resolve(`diagram.${format}`);
  const client = cloudClient();
  const result = await client.generate({
    prompt,
    diagramType: diagramType(opts.type),
    formats: [format],
  });
  await saveCloudFile(client, result.files, format, output, result.chargedCredits);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      format: { type: "string", short: "f" },
      page: { type: "string" },
      direction: { type: "string" },
      scale: { type: "string" },
      ai: { type: "boolean" },
      type: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return;
  }
  if (values.help || !command) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  switch (command) {
    case "convert":
    case "preview": {
      const input = rest[0];
      if (!input) throw new UsageError(`${command} needs an input file`);
      const fallback: Format = command === "preview" ? "png" : "vsdx";
      const head = readFileSync(input, "utf8").slice(0, 2048);
      const kind = detectInputKind(input, head);
      if (values.ai && (kind === "image" || kind === "text")) {
        await aiConvert(input, kind, values);
        return;
      }
      const format = formatFor(values.output, values.format, fallback);
      const output = values.output ?? defaultOutput(input, format);
      const data = await render(input, format, values);
      writeOut(output, data);
      if (format === "vsdx" && data instanceof Uint8Array) {
        const info = await inspectVsdx(data);
        process.stderr.write(
          `${info.pages.length} page(s), ${info.shapes} shapes, ${info.connectors} connectors\n`,
        );
      }
      process.stdout.write(`${output}\n`);
      return;
    }
    case "generate": {
      await aiGenerate(rest.join(" ").trim(), values);
      return;
    }
    case "inspect": {
      const input = rest[0];
      if (!input) throw new UsageError("inspect needs a .vsdx file");
      process.stdout.write(`${JSON.stringify(await inspectVsdx(readFileSync(input)), null, 2)}\n`);
      return;
    }
    case "schema": {
      process.stdout.write(`${JSON.stringify(diagramJsonSchema(), null, 2)}\n`);
      return;
    }
    case "mcp": {
      const { startStdioServer } = await import("./mcp.js");
      await startStdioServer();
      return;
    }
    default:
      throw new UsageError(`unknown command "${command}". Run vsdx-kit --help`);
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((error: unknown) => {
    if (error instanceof UnsupportedInput || error instanceof UsageError) fail(error.message, 2);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      fail(`file not found: ${(error as { path?: string }).path ?? ""}`);
    }
    fail(explainCloudError(error));
  });
}
