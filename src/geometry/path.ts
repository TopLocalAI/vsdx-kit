/** Anchor on shape bounding box (draw.io exitX/exitY are 0..1). */
export function anchorOnBox(
  box: { x: number; y: number; width: number; height: number },
  fracX: number,
  fracY: number,
): { x: number; y: number } {
  return {
    x: box.x + box.width * fracX,
    y: box.y + box.height * fracY,
  };
}

/** Project draw.io exit/entry fractions to shape perimeter (LibreOffice glue uses boundary). */
export function perimeterAnchor(
  box: { x: number; y: number; width: number; height: number },
  fracX: number,
  fracY: number,
  toward: { x: number; y: number },
  ellipse = false,
  rhombus = false,
): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let dx = box.width * (fracX - 0.5);
  let dy = box.height * (fracY - 0.5);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    dx = toward.x - cx;
    dy = toward.y - cy;
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: cx, y: cy };
  }
  if (rhombus) {
    const hw = box.width / 2;
    const hh = box.height / 2;
    const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return snapRhombusVertex(box, { x: cx + dx * scale, y: cy + dy * scale });
  }
  if (ellipse) {
    const a = box.width / 2;
    const b = box.height / 2;
    const scale = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
  const hw = box.width / 2;
  const hh = box.height / 2;
  const sx = Math.abs(dx) < 1e-9 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx);
  const sy = Math.abs(dy) < 1e-9 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Nearest corner of a rhombus (diamond) bounding box. */
export function snapRhombusVertex(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const vertices = [
    { x: cx, y: box.y },
    { x: box.x + box.width, y: cy },
    { x: cx, y: box.y + box.height },
    { x: box.x, y: cy },
  ];
  let best = vertices[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const v of vertices) {
    const d = (point.x - v.x) ** 2 + (point.y - v.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

export function defaultExitEntryFractions(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  sourceRhombus = false,
  targetRhombus = false,
): { exitX: number; exitY: number; entryX: number; entryY: number } {
  const scx = source.x + source.width / 2;
  const scy = source.y + source.height / 2;
  const tcx = target.x + target.width / 2;
  const tcy = target.y + target.height / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  const adx = scx - tcx;
  const ady = scy - tcy;

  const pickExit = () => {
    if (sourceRhombus) {
      if (dy > source.height * 0.12) return { x: 0.5, y: 1 };
      if (dy < -source.height * 0.12) return { x: 0.5, y: 0 };
      if (dx > 0) return { x: 1, y: 0.5 };
      if (dx < 0) return { x: 0, y: 0.5 };
      return { x: 0.5, y: 0.5 };
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
    }
    return dy >= 0 ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
  };

  const pickEntry = () => {
    if (targetRhombus) {
      if (ady > target.height * 0.12) return { x: 0.5, y: 1 };
      if (ady < -target.height * 0.12) return { x: 0.5, y: 0 };
      if (adx > 0) return { x: 0, y: 0.5 };
      if (adx < 0) return { x: 1, y: 0.5 };
      return { x: 0.5, y: 0.5 };
    }
    if (Math.abs(dy) <= 4 && Math.abs(dx) > 4) {
      return dx >= 0 ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
    }
    if (ady > Math.max(Math.abs(adx) * 0.45, 8)) return { x: 0.5, y: 1 };
    if (ady < -Math.max(Math.abs(adx) * 0.45, 8)) return { x: 0.5, y: 0 };
    // adx > 0: the source lies to the right, so the line enters on the right side
    if (Math.abs(adx) >= Math.abs(ady)) {
      return adx >= 0 ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
    }
    return ady >= 0 ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
  };

  const exit = pickExit();
  const entry = pickEntry();
  return { exitX: exit.x, exitY: exit.y, entryX: entry.x, entryY: entry.y };
}

export function dedupePoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out.length >= 2
    ? out
    : pts.length
      ? pts
      : [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ];
}

/** Simple orthogonal path when draw.io did not materialize waypoints. */
export function orthogonalPathPx(
  begin: { x: number; y: number },
  end: { x: number; y: number },
  orthogonal: boolean,
): { x: number; y: number }[] {
  if (!orthogonal) return [begin, end];
  if (Math.abs(begin.x - end.x) < 1 && Math.abs(begin.y - end.y) < 1) return [begin, end];
  if (Math.abs(begin.x - end.x) < 1 || Math.abs(begin.y - end.y) < 1) return [begin, end];
  if (end.y >= begin.y) return [begin, { x: end.x, y: begin.y }, end];
  return [begin, { x: begin.x, y: end.y }, end];
}

/** Insert axis-aligned bends so the first/last segment is not diagonal (e.g. diamond exits). */
export function orthogonalizePathEndpoints(
  points: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (points.length < 2) return points;

  const fixAt = (pts: { x: number; y: number }[], atStart: boolean) => {
    if (pts.length < 2) return pts;
    const i0 = atStart ? 0 : pts.length - 2;
    const i1 = atStart ? 1 : pts.length - 1;
    const p0 = pts[i0]!;
    const p1 = pts[i1]!;
    if (Math.abs(p0.x - p1.x) < 0.5 || Math.abs(p0.y - p1.y) < 0.5) return pts;
    const corner =
      Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y) ? { x: p1.x, y: p0.y } : { x: p0.x, y: p1.y };
    if (atStart) return [p0, corner, ...pts.slice(1)];
    return [...pts.slice(0, -1), corner, pts[pts.length - 1]!];
  };

  let out = points;
  out = fixAt(out, true);
  out = fixAt(out, false);
  return dedupePoints(out);
}

/** Midpoint along polyline by arc length (page px). */
export function pathMidpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  return pointAlongPath(points, 0.5);
}

/** Point at fraction t (0..1) of total arc length. */
export function pointAlongPath(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const clamped = Math.min(1, Math.max(0, t));
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-6) return points[0]!;
  let dist = total * clamped;
  for (let i = 1; i < points.length; i++) {
    const len = segLens[i - 1]!;
    if (dist <= len) {
      const segT = len > 0 ? dist / len : 0;
      return {
        x: points[i - 1]!.x + segT * (points[i]!.x - points[i - 1]!.x),
        y: points[i - 1]!.y + segT * (points[i]!.y - points[i - 1]!.y),
      };
    }
    dist -= len;
  }
  return points[points.length - 1]!;
}

type Pt = { x: number; y: number };

/**
 * Clean an orthogonal polyline: drop zero-length segments, merge collinear
 * runs and remove back-tracking spikes (A→B→C on one axis where C reverses).
 */
export function cleanOrthogonalPolyline(points: Pt[], eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) <= eps && Math.abs(last.y - p.y) <= eps) continue;
    out.push({ ...p });
    // collapse while the last three points are collinear on an axis
    while (out.length >= 3) {
      const a = out[out.length - 3]!;
      const b = out[out.length - 2]!;
      const c = out[out.length - 1]!;
      const vertical = Math.abs(a.x - b.x) <= eps && Math.abs(b.x - c.x) <= eps;
      const horizontal = Math.abs(a.y - b.y) <= eps && Math.abs(b.y - c.y) <= eps;
      if (!vertical && !horizontal) break;
      out.splice(out.length - 2, 1);
      if (Math.abs(a.x - c.x) <= eps && Math.abs(a.y - c.y) <= eps) out.pop();
    }
  }
  return out.length >= 2 ? out : points.slice(0, 2);
}

/**
 * Make every segment axis-aligned by inserting corners. `startAxis` / `endAxis`
 * say which axis the first / last segment must run along (exit / entry side).
 */
export function orthogonalizePolyline(
  points: Pt[],
  startAxis?: "v" | "h",
  endAxis?: "v" | "h",
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) > 0.5 && Math.abs(prev.y - p.y) > 0.5) {
      const isFirst = out.length === 1;
      const isLast = i === points.length - 1;
      let corner: Pt;
      if (isFirst && startAxis) {
        corner = startAxis === "v" ? { x: prev.x, y: p.y } : { x: p.x, y: prev.y };
      } else if (isLast && endAxis) {
        // last segment must run along endAxis
        corner = endAxis === "v" ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
      } else {
        corner = { x: p.x, y: prev.y };
      }
      out.push(corner);
    }
    out.push(p);
  }
  return out;
}
