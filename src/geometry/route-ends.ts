import type { PlacedNode } from "../types.js";

type Point = { x: number; y: number };

const EPS = 0.5;

/**
 * Move a route end onto the visible outline of its node, travelling only along
 * the route's own end segment so that segment stays straight.
 *
 * Layout engines place ends on the node's bounding box. For rectangles that box is
 * the outline already; ellipses, diamonds and pictograms with a hanging label
 * need the end slid along the segment axis until it meets the real outline.
 * `next` is the neighbouring route point (first bend, or the other end).
 */
export function snapRouteEnd(node: PlacedNode, end: Point, next: Point): Point {
  const vertical = Math.abs(end.x - next.x) < EPS;
  const horizontal = Math.abs(end.y - next.y) < EPS;
  if (!vertical && !horizontal) return end;

  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const a = node.width / 2;
  const b = node.height / 2;

  // Coordinate along the axis that is fixed, and the travel direction toward `next`.
  const fixed = vertical ? end.x : end.y;
  const towardNext = vertical ? Math.sign(next.y - end.y) : Math.sign(next.x - end.x);
  if (towardNext === 0) return end;

  // Half-extent of the outline, along the travel axis, at the fixed coordinate.
  let half: number | null;
  const offset = vertical ? fixed - cx : fixed - cy;
  const span = vertical ? a : b;
  const depth = vertical ? b : a;
  if (Math.abs(offset) > span + EPS) return end;
  const t = Math.min(1, Math.abs(offset) / span);
  switch (node.kind) {
    case "ellipse":
      half = depth * Math.sqrt(Math.max(0, 1 - t * t));
      break;
    case "diamond":
      half = depth * (1 - t);
      break;
    default:
      half = depth;
  }
  if (half < 1) return end;

  // The outline crossing on the side facing `next`.
  const centre = vertical ? cy : cx;
  const edge = centre + towardNext * half;
  return vertical ? { x: end.x, y: edge } : { x: edge, y: end.y };
}

/** Full polyline of a routed edge: source end, bends, target end. */
export function routePolyline(source: Point, bends: Point[], target: Point): Point[] {
  return [source, ...bends, target];
}
