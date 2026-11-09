/**
 * Optional client for the VSDX.ai public REST API (https://vsdx.ai/developers).
 *
 * Only used when you opt in (`--ai` in the CLI, or the AI tools of the MCP
 * server) and VSDX_AI_API_KEY is set. Offline conversion never calls it.
 */

export const VSDX_AI_URL = "https://vsdx.ai";
export const UTM = "utm_source=vsdx-kit";
export const IMAGE_TO_VISIO_URL = `${VSDX_AI_URL}/tools/image-to-visio?${UTM}`;
export const API_KEYS_URL = `${VSDX_AI_URL}/settings/apikeys?${UTM}`;
export const DEVELOPERS_URL = `${VSDX_AI_URL}/developers?${UTM}`;

export const DIAGRAM_TYPES = [
  "auto",
  "flowchart",
  "organization",
  "architecture",
  "network",
  "swimlane",
  "er",
  "uml_activity",
  "uml_component",
  "bpmn",
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export type CloudFormat = "vsdx" | "png" | "svg" | "drawio";

export interface CloudFile {
  url: string;
  expiresAt?: string;
  bytes?: number;
}

export interface CloudGenerateResult {
  title: string;
  summary: string;
  files: Partial<Record<CloudFormat, CloudFile>>;
  chargedCredits: number;
}

export interface CloudConvertResult {
  files: Partial<Record<CloudFormat, CloudFile>>;
  chargedCredits: number;
}

export class VsdxCloudError extends Error {
  readonly status: number;
  readonly code: string;
  readonly upgradeUrl?: string;
  constructor(status: number, code: string, message: string, upgradeUrl?: string) {
    super(message);
    this.name = "VsdxCloudError";
    this.status = status;
    this.code = code;
    this.upgradeUrl = upgradeUrl;
  }
}

export interface VsdxCloudClientOptions {
  apiKey: string;
  /** Defaults to VSDX_AI_BASE_URL or https://vsdx.ai/api/v1. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** API key from the environment (VSDX_AI_API_KEY), if any. */
export function apiKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env.VSDX_AI_API_KEY?.trim();
  return key ? key : undefined;
}

export class VsdxCloudClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VsdxCloudClientOptions) {
    if (!options.apiKey) throw new Error("VSDX.ai API key is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (
      options.baseUrl ??
      process.env.VSDX_AI_BASE_URL ??
      `${VSDX_AI_URL}/api/v1`
    ).replace(/\/+$/u, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "user-agent": "vsdx-kit",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; upgradeUrl?: string } })
        ?.error;
      throw new VsdxCloudError(
        res.status,
        err?.code ?? "http_error",
        err?.message ?? `VSDX.ai API returned HTTP ${res.status}`,
        err?.upgradeUrl,
      );
    }
    if (json === undefined)
      throw new VsdxCloudError(res.status, "invalid_response", "VSDX.ai returned invalid JSON");
    return json as T;
  }

  /** Remaining credit balance. */
  async credits(): Promise<number> {
    return (await this.request<{ balance: number }>("GET", "/credits")).balance;
  }

  /** Generate a diagram from a text prompt (POST /generate). */
  async generate(input: {
    prompt: string;
    diagramType?: DiagramType;
    formats?: CloudFormat[];
  }): Promise<CloudGenerateResult> {
    return this.request("POST", "/generate", {
      prompt: input.prompt,
      diagramType: input.diagramType ?? "auto",
      formats: input.formats ?? ["vsdx", "png"],
    });
  }

  /**
   * Rebuild a picture of a diagram (PNG/JPEG/WebP) as an editable diagram
   * (POST /convert with image_base64 or image_url). Formats: vsdx, png, drawio.
   */
  async convertImage(input: {
    imageBase64?: string;
    imageUrl?: string;
    formats?: ("vsdx" | "png" | "drawio")[];
  }): Promise<CloudConvertResult> {
    if (!input.imageBase64 === !input.imageUrl) {
      throw new Error("Pass exactly one of imageBase64 or imageUrl");
    }
    return this.request("POST", "/convert", {
      ...(input.imageBase64 ? { image_base64: input.imageBase64 } : { image_url: input.imageUrl }),
      formats: input.formats ?? ["vsdx", "png"],
    });
  }

  /** Download a result file URL returned by generate/convert. */
  async download(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url);
    if (!res.ok)
      throw new VsdxCloudError(
        res.status,
        "download_failed",
        `Download failed: HTTP ${res.status}`,
      );
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Human-readable hint for an API error. */
export function explainCloudError(error: unknown): string {
  if (error instanceof VsdxCloudError) {
    if (error.status === 401)
      return `VSDX.ai rejected the API key (${error.message}). Create one at ${API_KEYS_URL}`;
    if (error.status === 402 || error.status === 403) {
      return `${error.message}${error.upgradeUrl ? ` — ${error.upgradeUrl}` : ` — ${VSDX_AI_URL}/pricing?${UTM}`}`;
    }
    return `VSDX.ai API error (${error.code}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
