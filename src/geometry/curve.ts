type Pt = { x: number; y: number };

/** Circle through three points (null when they are (nearly) collinear). */
export function circleThrough(a: Pt, b: Pt, c: Pt): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/**
 * Signed sagitta of the circular arc a → via → b: distance from the chord
 * midpoint to the arc midpoint. Positive when the arc bulges to the left of
 * the chord direction a→b in page px (y down). 0 when collinear.
 */
export function arcSagitta(a: Pt, via: Pt, b: Pt): number {
  const circle = circleThrough(a, via, b);
  if (!circle) return 0;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-6) return 0;
  // side of via relative to the chord (cross product, y down: >0 means right)
  const cross = (b.x - a.x) * (via.y - a.y) - (b.y - a.y) * (via.x - a.x);
  const side = cross > 0 ? -1 : 1; // +1 = left of a→b
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dCenter = Math.hypot(circle.cx - mx, circle.cy - my);
  // is the centre on the same side of the chord as via?
  const crossC = (b.x - a.x) * (circle.cy - a.y) - (b.y - a.y) * (circle.cx - a.x);
  const sameSide = crossC * cross > 0;
  const s = sameSide ? circle.r + dCenter : circle.r - dCenter;
  return side * s;
}

/** Sample the circular arc from a through via to b (inclusive endpoints). */
export function arcPoints(a: Pt, via: Pt, b: Pt, segments = 24): Pt[] {
  const circle = circleThrough(a, via, b);
  if (!circle) return [a, b];
  const { cx, cy, r } = circle;
  const ang = (p: Pt) => Math.atan2(p.y - cy, p.x - cx);
  const a0 = ang(a);
  const am = ang(via);
  const a1 = ang(b);
  const norm = (t: number) => {
    let v = t;
    while (v < 0) v += Math.PI * 2;
    while (v >= Math.PI * 2) v -= Math.PI * 2;
    return v;
  };
  // sweep in the direction that passes through via
  let sweep = norm(a1 - a0);
  if (norm(am - a0) > sweep) sweep -= Math.PI * 2;
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = a0 + (sweep * i) / segments;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  out[0] = { ...a };
  out[out.length - 1] = { ...b };
  return out;
}

/** Centripetal Catmull–Rom spline through all points, sampled per span. */
export function catmullRomPoints(points: Pt[], perSpan = 12): Pt[] {
  if (points.length < 3) return points.slice();
  const out: Pt[] = [{ ...points[0]! }];
  const ext = [
    {
      x: 2 * points[0]!.x - points[1]!.x,
      y: 2 * points[0]!.y - points[1]!.y,
    },
    ...points,
    {
      x: 2 * points[points.length - 1]!.x - points[points.length - 2]!.x,
      y: 2 * points[points.length - 1]!.y - points[points.length - 2]!.y,
    },
  ];
  const tj = (ti: number, p: Pt, q: Pt) =>
    ti + Math.max(1e-3, Math.hypot(q.x - p.x, q.y - p.y) ** 0.5);
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1]!;
    const p1 = ext[i]!;
    const p2 = ext[i + 1]!;
    const p3 = ext[i + 2]!;
    const t0 = 0;
    const t1 = tj(t0, p0, p1);
    const t2 = tj(t1, p1, p2);
    const t3 = tj(t2, p2, p3);
    for (let k = 1; k <= perSpan; k++) {
      const t = t1 + ((t2 - t1) * k) / perSpan;
      const lerp = (p: Pt, q: Pt, ta: number, tb: number): Pt => {
        const u = (tb - t) / (tb - ta);
        const v = (t - ta) / (tb - ta);
        return { x: p.x * u + q.x * v, y: p.y * u + q.y * v };
      };
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out[out.length - 1] = { ...points[points.length - 1]! };
  return out;
}

/**
 * Smooth path through control points: straight for 2 points, a circular arc
 * for 3 (one bend), Catmull–Rom for more. Used by preview and Visio alike.
 */
export function curvePathPx(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  if (points.length === 3) return arcPoints(points[0]!, points[1]!, points[2]!);
  return catmullRomPoints(points);
}
