import type { PlacedEdge, PlacedNode } from "../types.js";
import { defaultExitEntryFractions, perimeterAnchor } from "./path.js";

function isRhombus(kind: PlacedNode["kind"]): boolean {
  return kind === "diamond";
}

function isEllipse(kind: PlacedNode["kind"]): boolean {
  return kind === "ellipse";
}

/** Fill missing source/target perimeter points (same rules as drawio-in). */
export function enrichEdgeEndpoints(
  edge: PlacedEdge,
  nodeById: Map<string, PlacedNode>,
): PlacedEdge {
  if (edge.sourcePoint && edge.targetPoint) return edge;

  const source = edge.source ? nodeById.get(edge.source) : undefined;
  const target = edge.target ? nodeById.get(edge.target) : undefined;
  if (!source || !target) return edge;

  const st = edge.style ?? {};
  const hasExit = st.exitX !== undefined;
  const hasExitY = st.exitY !== undefined;
  const hasEntry = st.entryX !== undefined;
  const hasEntryY = st.entryY !== undefined;
  let exitX = hasExit ? st.exitX! : 0.5;
  let exitY = hasExitY ? st.exitY! : 0.5;
  let entryX = hasEntry ? st.entryX! : 0.5;
  let entryY = hasEntryY ? st.entryY! : 0.5;

  if (!hasExit || !hasExitY || !hasEntry || !hasEntryY) {
    const d = defaultExitEntryFractions(
      source,
      target,
      isRhombus(source.kind),
      isRhombus(target.kind),
    );
    if (!hasExit) exitX = d.exitX;
    if (!hasExitY) exitY = d.exitY;
    if (!hasEntry) entryX = d.entryX;
    if (!hasEntryY) entryY = d.entryY;
  }

  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };

  return {
    ...edge,
    style: { ...st, exitX, exitY, entryX, entryY },
    sourcePoint:
      edge.sourcePoint ??
      perimeterAnchor(
        source,
        exitX,
        exitY,
        targetCenter,
        isEllipse(source.kind),
        isRhombus(source.kind),
      ),
    targetPoint:
      edge.targetPoint ??
      perimeterAnchor(
        target,
        entryX,
        entryY,
        sourceCenter,
        isEllipse(target.kind),
        isRhombus(target.kind),
      ),
  };
}

export function nodeMapFromDiagram(nodes: PlacedNode[]): Map<string, PlacedNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
