import type { PlacedNode } from "../types.js";

const AREA_KINDS = new Set<PlacedNode["kind"]>(["container", "swimlane"]);
const PAGE = "#ffffff";
/** Groups and lanes are drawn semi-transparent unless they set their own opacity. */
const DEFAULT_AREA_OPACITY = 45;

function parseHex(color: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function blend(top: string, bottom: string, opacity: number): string {
  const a = parseHex(top);
  const b = parseHex(bottom);
  if (!a || !b) return bottom;
  const t = Math.max(0, Math.min(1, opacity / 100));
  const mix = a.map((v, i) => Math.round(v * t + b[i]! * (1 - t)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Colour actually visible under a connector label: enclosing groups and lanes
 * blended over the page, outermost first. Labels use it instead of a white box
 * so they blend into the background while still masking the line beneath.
 */
export function labelBackgroundAt(nodes: PlacedNode[], point: { x: number; y: number }): string {
  const enclosing = nodes
    .filter((node) => {
      if (!AREA_KINDS.has(node.kind)) return false;
      const fill = node.style?.fill;
      if (!fill || fill === "none") return false;
      return (
        point.x >= node.x &&
        point.x <= node.x + node.width &&
        point.y >= node.y &&
        point.y <= node.y + node.height
      );
    })
    .sort((a, b) => b.width * b.height - a.width * a.height);
  let color = PAGE;
  for (const node of enclosing) {
    color = blend(node.style!.fill!, color, node.style?.opacity ?? DEFAULT_AREA_OPACITY);
  }
  return color;
}
