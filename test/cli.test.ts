import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectVsdx } from "../src/index.js";
import { TINY_PNG_B64 } from "./helpers.js";

const root = join(fileURLToPath(import.meta.url), "../..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(root, "src/cli.ts");
const tmp = mkdtempSync(join(tmpdir(), "vsdx-kit-cli-"));

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const res = spawnSync(tsx, [cli, ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...process.env, VSDX_AI_API_KEY: "", ...env },
    timeout: 60_000,
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe("cli", () => {
  it("prints help and version", () => {
    expect(run(["--help"]).stdout).toContain("vsdx-kit convert");
    expect(run(["--version"]).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("converts JSON to .vsdx", async () => {
    const out = join(tmp, "flow.vsdx");
    const res = run(["convert", join(root, "examples/order-flow.json"), "-o", out]);
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout.trim()).toBe(out);
    expect(res.stderr).toMatch(/1 page\(s\), \d+ shapes, 10 connectors/);
    const info = await inspectVsdx(readFileSync(out));
    expect(info.connectors).toBe(10);
  });

  it("converts draw.io to .vsdx next to the input by default", async () => {
    const src = join(tmp, "net.drawio");
    writeFileSync(src, readFileSync(join(root, "examples/network-zh.drawio")));
    const res = run(["convert", src]);
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout.trim()).toBe(join(tmp, "net.vsdx"));
  });

  it("writes png, svg and drawio formats", () => {
    const input = join(root, "examples/zh-approval.json");
    const png = run(["preview", input, "-o", join(tmp, "zh.png")]);
    expect(png.code, png.stderr).toBe(0);
    expect(readFileSync(join(tmp, "zh.png")).subarray(1, 4).toString()).toBe("PNG");
    expect(run(["convert", input, "--format", "svg", "-o", join(tmp, "zh.svg")]).code).toBe(0);
    expect(readFileSync(join(tmp, "zh.svg"), "utf8")).toContain("<svg");
    expect(run(["convert", input, "-o", join(tmp, "zh.drawio")]).code).toBe(0);
    expect(readFileSync(join(tmp, "zh.drawio"), "utf8")).toContain("<mxfile");
  });

  it("points picture and text inputs to VSDX.ai and exits non-zero", () => {
    const pic = join(tmp, "whiteboard.png");
    writeFileSync(pic, Buffer.from(TINY_PNG_B64, "base64"));
    const res = run(["convert", pic]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("needs AI recognition");
    expect(res.stderr).toContain("https://vsdx.ai/tools/image-to-visio?utm_source=vsdx-kit");
    expect(res.stderr.trim().split("\n")).toHaveLength(1);

    const txt = join(tmp, "notes.md");
    writeFileSync(txt, "# A flow\nlogin then checkout");
    const t = run(["convert", txt]);
    expect(t.code).toBe(2);
    expect(t.stderr).toContain("utm_source=vsdx-kit");
  });

  it("--ai without VSDX_AI_API_KEY explains where to get a key", () => {
    const pic = join(tmp, "p.png");
    writeFileSync(pic, Buffer.from(TINY_PNG_B64, "base64"));
    const res = run(["convert", pic, "--ai"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("VSDX_AI_API_KEY");
    expect(res.stderr).toContain("https://vsdx.ai/settings/apikeys");
  });

  it("reports invalid JSON diagrams", () => {
    const bad = join(tmp, "bad.json");
    writeFileSync(bad, JSON.stringify({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "b" }] }));
    const res = run(["convert", bad]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Unknown node "b"');
  });

  it("prints the JSON Schema", () => {
    const res = run(["schema"]);
    expect(JSON.parse(res.stdout).title).toBe("vsdx-kit diagram");
  });
});
