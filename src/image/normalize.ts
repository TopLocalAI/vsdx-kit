import { Resvg } from "@resvg/resvg-js";
import type { ImageMime } from "./data-uri.js";

export interface NormalizedImage {
  mime: "image/png" | "image/jpeg";
  data: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}

/** Width/height from a PNG IHDR chunk. */
export function pngDimensions(data: Uint8Array): { w: number; h: number } | null {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { w: view.getUint32(16, false), h: view.getUint32(20, false) };
}

/** Width/height from the first JPEG SOF0/SOF2 marker. */
export function jpegDimensions(data: Uint8Array): { w: number; h: number } | null {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = data[i + 1];
    if (marker === undefined) break;
    if (marker === 0xc0 || marker === 0xc2) {
      const h = (data[i + 5]! << 8) | data[i + 6]!;
      const w = (data[i + 7]! << 8) | data[i + 8]!;
      return { w, h };
    }
    const len = (data[i + 2]! << 8) | data[i + 3]!;
    i += 2 + len;
  }
  return null;
}

/** Rasterize an SVG picture at 2× its display size (Visio Foreign data must be a bitmap). */
function rasterizeSvg(svgBytes: Uint8Array, targetW: number): Uint8Array {
  const svg = Buffer.from(svgBytes).toString("utf8");
  const w = Math.max(1, Math.round(targetW * 2));
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w }, background: "transparent" });
  return Uint8Array.from(resvg.render().asPng());
}

/** Normalize embedded image bytes for VSDX (Visio Foreign bitmap: PNG or JPEG). */
export function normalizeEmbeddedImage(
  mime: ImageMime,
  data: Uint8Array,
  displayWidthPx: number,
  displayHeightPx: number,
): NormalizedImage | null {
  if (mime === "image/png") {
    const dim = pngDimensions(data);
    if (!dim) return null;
    return { mime, data, pixelWidth: dim.w, pixelHeight: dim.h };
  }
  if (mime === "image/jpeg") {
    const dim = jpegDimensions(data);
    return {
      mime,
      data,
      pixelWidth: dim?.w ?? Math.round(displayWidthPx),
      pixelHeight: dim?.h ?? Math.round(displayHeightPx),
    };
  }
  if (mime === "image/svg+xml") {
    try {
      const png = rasterizeSvg(data, displayWidthPx);
      const dim = pngDimensions(png);
      return {
        mime: "image/png",
        data: png,
        pixelWidth: dim?.w ?? Math.round(displayWidthPx * 2),
        pixelHeight: dim?.h ?? Math.round(displayHeightPx * 2),
      };
    } catch {
      return null;
    }
  }
  return null;
}
