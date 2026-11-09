export type ImageMime = "image/png" | "image/jpeg" | "image/svg+xml";

export type ImageDataUriParseResult =
  | { ok: true; mime: ImageMime; data: Uint8Array }
  | { ok: false; reason: "missing" | "unsupported-scheme" | "unsupported-mime" | "invalid" };

function decodePayload(_mime: string, payload: string, base64: boolean): Uint8Array | null {
  try {
    const raw = base64
      ? payload.replace(/\s/g, "")
      : decodeURIComponent(payload.replace(/\s/g, ""));
    if (base64 || /^[A-Za-z0-9+/=]+$/.test(raw.slice(0, 64))) {
      return Uint8Array.from(Buffer.from(raw, "base64"));
    }
    return Uint8Array.from(Buffer.from(raw, "utf8"));
  } catch {
    return null;
  }
}

function normalizeMime(mime: string): ImageMime | null {
  const m = mime.toLowerCase().split(";")[0]?.trim();
  if (m === "image/png") return "image/png";
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/svg+xml") return "image/svg+xml";
  return null;
}

/** Parse draw.io `image=` values: data URIs (with or without `;base64`) and reject remote URLs. */
export function parseDrawioImageRef(
  imageRef: string | undefined,
): ImageDataUriParseResult | { ok: false; reason: "remote-url"; url: string } {
  if (!imageRef?.trim()) return { ok: false, reason: "missing" };
  const trimmed = imageRef.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: false, reason: "remote-url", url: trimmed };
  }
  if (!trimmed.toLowerCase().startsWith("data:")) {
    return { ok: false, reason: "unsupported-scheme" };
  }

  const comma = trimmed.indexOf(",");
  if (comma < 0) return { ok: false, reason: "invalid" };
  const header = trimmed.slice(0, comma);
  const payload = trimmed.slice(comma + 1);
  const mimePart = header.slice(5).split(";")[0] ?? "";
  const mime = normalizeMime(mimePart);
  if (!mime) return { ok: false, reason: "unsupported-mime" };
  const base64 = /;base64/i.test(header) || !/;charset=/i.test(header);
  const data = decodePayload(mime, payload, base64);

  if (!data?.length) return { ok: false, reason: "invalid" };
  return { ok: true, mime, data };
}

export function imageToDataUri(mime: ImageMime, data: Uint8Array): string {
  const b64 = Buffer.from(data).toString("base64");
  return `data:${mime};base64,${b64}`;
}
