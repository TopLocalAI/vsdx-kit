import { existsSync, readFileSync } from "node:fs";

/**
 * Minimal OpenType reader: advance widths from cmap + hmtx.
 * Used so text fitting measures with the same font resvg draws with.
 */
export interface FontAdvanceTable {
  unitsPerEm: number;
  /** Advance width (font units) for a code point, or undefined if not mapped. */
  advance(codePoint: number): number | undefined;
}

interface CmapGroup {
  start: number;
  end: number;
  glyph: number;
}

function readTables(buf: Buffer): Map<string, { offset: number; length: number }> {
  const numTables = buf.readUInt16BE(4);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString("latin1", rec, rec + 4);
    out.set(tag, { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) });
  }
  return out;
}

function parseCmap(buf: Buffer, cmapOff: number): (cp: number) => number {
  const numSub = buf.readUInt16BE(cmapOff + 2);
  let fmt12 = -1;
  let fmt4 = -1;
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOff + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = cmapOff + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);
    if (format === 12 && (platform === 3 || platform === 0)) fmt12 = sub;
    if (format === 4 && (platform === 3 || platform === 0) && encoding <= 1) fmt4 = sub;
  }
  if (fmt12 >= 0) {
    const n = buf.readUInt32BE(fmt12 + 12);
    const groups: CmapGroup[] = [];
    for (let i = 0; i < n; i++) {
      const g = fmt12 + 16 + i * 12;
      groups.push({
        start: buf.readUInt32BE(g),
        end: buf.readUInt32BE(g + 4),
        glyph: buf.readUInt32BE(g + 8),
      });
    }
    return (cp) => {
      let lo = 0;
      let hi = groups.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = groups[mid]!;
        if (cp < g.start) hi = mid - 1;
        else if (cp > g.end) lo = mid + 1;
        else return g.glyph + (cp - g.start);
      }
      return 0;
    };
  }
  if (fmt4 >= 0) {
    const segX2 = buf.readUInt16BE(fmt4 + 6);
    const segs = segX2 / 2;
    const endOff = fmt4 + 14;
    const startOff = endOff + segX2 + 2;
    const deltaOff = startOff + segX2;
    const rangeOff = deltaOff + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segs; i++) {
        const end = buf.readUInt16BE(endOff + i * 2);
        if (cp > end) continue;
        const start = buf.readUInt16BE(startOff + i * 2);
        if (cp < start) return 0;
        const delta = buf.readInt16BE(deltaOff + i * 2);
        const ro = buf.readUInt16BE(rangeOff + i * 2);
        if (ro === 0) return (cp + delta) & 0xffff;
        const gi = buf.readUInt16BE(rangeOff + i * 2 + ro + (cp - start) * 2);
        return gi === 0 ? 0 : (gi + delta) & 0xffff;
      }
      return 0;
    };
  }
  return () => 0;
}

export function parseFontAdvances(buf: Buffer): FontAdvanceTable {
  const tables = readTables(buf);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  const cmap = tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmap) throw new Error("font lacks head/hhea/hmtx/cmap");
  const unitsPerEm = buf.readUInt16BE(head.offset + 18);
  const numHMetrics = buf.readUInt16BE(hhea.offset + 34);
  const glyphOf = parseCmap(buf, cmap.offset);
  const lastAdvance = buf.readUInt16BE(hmtx.offset + (numHMetrics - 1) * 4);
  const cache = new Map<number, number | undefined>();
  return {
    unitsPerEm,
    advance(cp: number) {
      if (cache.has(cp)) return cache.get(cp);
      const gid = glyphOf(cp);
      let adv: number | undefined;
      if (gid > 0) {
        adv = gid < numHMetrics ? buf.readUInt16BE(hmtx.offset + gid * 4) : lastAdvance;
      }
      cache.set(cp, adv);
      return adv;
    },
  };
}

const loaded = new Map<string, FontAdvanceTable | null>();

/** Load (and cache) advance widths from a font file; null if unreadable. */
export function loadFontAdvances(path: string): FontAdvanceTable | null {
  if (loaded.has(path)) return loaded.get(path)!;
  let table: FontAdvanceTable | null = null;
  try {
    if (existsSync(path)) table = parseFontAdvances(readFileSync(path));
  } catch {
    table = null;
  }
  loaded.set(path, table);
  return table;
}
