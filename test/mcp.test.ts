import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { inspectVsdx } from "../src/index.js";
import { createMcpServer, type McpServerOptions } from "../src/mcp.js";

const tmp = mkdtempSync(join(tmpdir(), "vsdx-kit-mcp-"));

async function connect(options: McpServerOptions) {
  const server = createMcpServer({ cwd: tmp, ...options });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function textOf(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0]!.text;
}

describe("mcp server", () => {
  it("lists only the offline tools without an API key", async () => {
    const client = await connect({ apiKey: "" });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "convert_drawio_to_vsdx",
      "create_vsdx_from_json",
    ]);
    const mentions = tools.map((t) => (t.description ?? "").split("VSDX.ai").length - 1);
    expect(mentions.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("adds the AI tools when a key is configured", async () => {
    const client = await connect({ apiKey: "vsdx_test" });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "ai_convert_image_to_vsdx",
      "ai_generate_diagram",
      "convert_drawio_to_vsdx",
      "create_vsdx_from_json",
    ]);
  });

  it("create_vsdx_from_json writes the file and returns counts", async () => {
    const client = await connect({ apiKey: "" });
    const result = await client.callTool({
      name: "create_vsdx_from_json",
      arguments: {
        diagram: {
          title: "MCP",
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "乙", shape: "diamond" },
          ],
          edges: [{ from: "a", to: "b", label: "go" }],
        },
        output_path: "out/mcp.vsdx",
        png_preview: true,
      },
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(textOf(result));
    expect(data.path).toBe(join(tmp, "out/mcp.vsdx"));
    expect(data.connectors).toBe(1);
    expect(data.shapes).toBe(3);
    expect(readFileSync(data.preview).subarray(1, 4).toString()).toBe("PNG");
    expect((await inspectVsdx(readFileSync(data.path))).connectors).toBe(1);
  });

  it("returns validation errors as tool errors", async () => {
    const client = await connect({ apiKey: "" });
    const result = await client.callTool({
      name: "create_vsdx_from_json",
      arguments: {
        diagram: { nodes: [{ id: "a" }], edges: [{ from: "a", to: "x" }] },
        output_path: "bad.vsdx",
      },
    });
    expect(result.isError).toBe(true);
  });

  it("convert_drawio_to_vsdx converts a file", async () => {
    const client = await connect({ apiKey: "" });
    const src = join(tmp, "in.drawio");
    writeFileSync(
      src,
      readFileSync(
        join(fileURLToPath(import.meta.url), "../../examples/two-pages-compressed.drawio"),
      ),
    );
    const result = await client.callTool({
      name: "convert_drawio_to_vsdx",
      arguments: { drawio_path: src, output_path: "in.vsdx" },
    });
    const data = JSON.parse(textOf(result));
    expect(data.pages).toEqual(["Icons", "Workflow"]);
    expect(data.connectors).toBe(4);
  });

  it("ai_generate_diagram proxies to the VSDX.ai API (mocked)", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/generate")) {
        return Response.json({
          title: "Login",
          summary: "s",
          files: { vsdx: { url: "https://files.test/a.vsdx" } },
          chargedCredits: 10,
        });
      }
      return new Response(new Uint8Array([80, 75, 3, 4]));
    });
    const client = await connect({
      apiKey: "vsdx_test",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await client.callTool({
      name: "ai_generate_diagram",
      arguments: { prompt: "login flow", output_path: "ai.vsdx" },
    });
    const data = JSON.parse(textOf(result));
    expect(data.chargedCredits).toBe(10);
    expect(readFileSync(join(tmp, "ai.vsdx")).subarray(0, 2).toString()).toBe("PK");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
