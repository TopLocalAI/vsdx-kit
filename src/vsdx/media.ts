import { createHash } from "node:crypto";
import type { PlacedNode } from "../types.js";

export type VisioImageCompression = "PNG" | "JPEG";

export interface MediaEntry {
  relId: string;
  partPath: string;
  zipPath: string;
  data: Uint8Array;
  compression: VisioImageCompression;
}

export class VsdxMediaRegistry {
  private readonly byHash = new Map<string, MediaEntry>();
  private readonly entries: MediaEntry[] = [];
  private nextRel = 2;

  registerPngOrJpeg(data: Uint8Array, mime: "image/png" | "image/jpeg"): string {
    const hash = createHash("sha256").update(data).digest("hex");
    const existing = this.byHash.get(hash);
    if (existing) return existing.relId;

    const index = this.entries.length + 1;
    const isJpeg = mime === "image/jpeg";
    const ext = isJpeg ? "jpeg" : "png";
    const relId = `rId${this.nextRel++}`;
    const partPath = `../media/image${index}.${ext}`;
    const zipPath = `visio/media/image${index}.${ext}`;
    const entry: MediaEntry = {
      relId,
      partPath,
      zipPath,
      data,
      compression: isJpeg ? "JPEG" : "PNG",
    };
    this.byHash.set(hash, entry);
    this.entries.push(entry);
    return relId;
  }

  lookupRelId(data: Uint8Array): string | undefined {
    const hash = createHash("sha256").update(data).digest("hex");
    return this.byHash.get(hash)?.relId;
  }

  compressionForRel(relId: string): VisioImageCompression {
    const entry = this.entries.find((e) => e.relId === relId);
    return entry?.compression ?? "PNG";
  }

  allEntries(): MediaEntry[] {
    return this.entries;
  }

  buildPageRelsXml(): string {
    const master =
      '<Relationship Type="http://schemas.microsoft.com/visio/2010/relationships/master" Id="rId1" Target="../masters/master1.xml"/>';
    const images = this.entries
      .map(
        (e) =>
          `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Id="${e.relId}" Target="${e.partPath}"/>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${master}${images}</Relationships>`;
  }
}

export function collectImageMedia(nodes: PlacedNode[], registry: VsdxMediaRegistry): void {
  for (const node of nodes) {
    if (node.kind !== "image" || !node.image) continue;
    registry.registerPngOrJpeg(node.image.data, node.image.mime);
  }
}
