import { encodeXML } from "entities";

export function escapeXml(text: string): string {
  return encodeXML(text);
}

/**
 * Visio colour cells must be #RRGGBB: LibreOffice refuses to open a file with
 * "#123" or "#11223344". Expands #RGB / #RGBA and drops the alpha of #RRGGBBAA.
 */
export function normalizeHexColor(value: string): string {
  const m = /^#([0-9a-fA-F]+)$/.exec(value.trim());
  if (!m) return value;
  const h = m[1]!;
  if (h.length === 3 || h.length === 4) {
    return `#${h
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("")}`.toUpperCase();
  }
  if (h.length === 8) return `#${h.slice(0, 6)}`.toUpperCase();
  return value;
}

/** Rewrite every `V="#…"` cell value in a page/master XML to #RRGGBB. */
export function normalizeColorCells(xml: string): string {
  return xml.replace(/ V="(#[0-9a-fA-F]{3,8})"/g, (all, c: string) => {
    const n = normalizeHexColor(c);
    return n === c ? all : ` V="${n}"`;
  });
}
