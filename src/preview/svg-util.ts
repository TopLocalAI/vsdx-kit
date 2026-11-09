export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Fixed-precision coordinates for deterministic SVG output. */
export function n(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}

export function relX(nodeX: number, width: number, frac: number): number {
  return nodeX + width * frac;
}

export function relY(nodeY: number, height: number, frac: number): number {
  return nodeY + height * (1 - frac);
}
