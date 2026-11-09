import { describe, expect, it, vi } from "vitest";
import { explainCloudError, VsdxCloudClient, VsdxCloudError } from "../src/cloud.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init),
  );
}

describe("VsdxCloudClient", () => {
  it("calls POST /generate with bearer auth and the documented body", async () => {
    const fetch = mockFetch(() =>
      Response.json({
        title: "T",
        summary: "S",
        files: { vsdx: { url: "https://files/x.vsdx" } },
        chargedCredits: 10,
      }),
    );
    const client = new VsdxCloudClient({
      apiKey: "vsdx_test",
      baseUrl: "https://api.test/v1",
      fetch,
    });
    const res = await client.generate({ prompt: "login flow", formats: ["vsdx"] });
    expect(res.files.vsdx?.url).toBe("https://files/x.vsdx");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/generate");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Bearer vsdx_test",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "login flow",
      diagramType: "auto",
      formats: ["vsdx"],
    });
  });

  it("sends pictures to POST /convert as image_base64", async () => {
    const fetch = mockFetch(() =>
      Response.json({ files: { vsdx: { url: "u" } }, chargedCredits: 10 }),
    );
    const client = new VsdxCloudClient({ apiKey: "k", baseUrl: "https://api.test/v1", fetch });
    await client.convertImage({ imageBase64: "AAAA", formats: ["vsdx"] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/convert");
    expect(JSON.parse(String(init?.body))).toEqual({ image_base64: "AAAA", formats: ["vsdx"] });
  });

  it("maps API errors", async () => {
    const fetch = mockFetch(() =>
      Response.json(
        {
          error: {
            code: "insufficient_credits",
            message: "Not enough credits",
            upgradeUrl: "https://vsdx.ai/pricing",
          },
        },
        { status: 402 },
      ),
    );
    const client = new VsdxCloudClient({ apiKey: "k", fetch });
    const err = await client.credits().catch((e) => e);
    expect(err).toBeInstanceOf(VsdxCloudError);
    expect(err.code).toBe("insufficient_credits");
    expect(explainCloudError(err)).toContain("https://vsdx.ai/pricing");
  });
});
