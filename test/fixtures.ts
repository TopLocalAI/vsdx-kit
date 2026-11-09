import type { PlacedDiagram } from "../src/types.js";

export const minimalDiagram: PlacedDiagram = {
  width: 640,
  height: 867,
  nodes: [
    {
      id: "a",
      kind: "roundedRect",
      x: 80,
      y: 120,
      width: 140,
      height: 60,
      label: "输入节点",
      style: { fill: "#DAE8FC", stroke: "#475569", fontSize: 14 },
    },
    {
      id: "b",
      kind: "rect",
      x: 280,
      y: 120,
      width: 140,
      height: 60,
      label: "处理数据",
      style: { fill: "#D5E8D4" },
    },
    {
      id: "c",
      kind: "rect",
      x: 480,
      y: 120,
      width: 140,
      height: 60,
      label: "输出结果",
      style: { fill: "#FFF2CC" },
    },
    {
      id: "d",
      kind: "diamond",
      x: 280,
      y: 280,
      width: 120,
      height: 100,
      label: "是否通过?",
      style: { fill: "#FFF2CC" },
    },
    {
      id: "e",
      kind: "roundedRect",
      x: 80,
      y: 280,
      width: 150,
      height: 70,
      label: "人工审核",
      style: { fill: "#E1D5E7" },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "a",
      target: "b",
      label: "第一步",
      sourcePoint: { x: 220, y: 150 },
      targetPoint: { x: 280, y: 150 },
    },
    {
      id: "e2",
      source: "b",
      target: "d",
      label: "校验",
      sourcePoint: { x: 350, y: 180 },
      targetPoint: { x: 340, y: 280 },
    },
    {
      id: "e3",
      source: "d",
      target: "c",
      label: "完成",
      sourcePoint: { x: 400, y: 330 },
      targetPoint: { x: 480, y: 150 },
    },
  ],
};

const kindSpecs: { kind: PlacedDiagram["nodes"][0]["kind"]; label: string }[] = [
  { kind: "rect", label: "rect" },
  { kind: "roundedRect", label: "roundedRect" },
  { kind: "diamond", label: "diamond" },
  { kind: "ellipse", label: "ellipse" },
  { kind: "cylinder", label: "cylinder" },
  { kind: "note", label: "note" },
  { kind: "component", label: "component" },
  { kind: "actor", label: "actor" },
  { kind: "container", label: "container" },
  { kind: "swimlane", label: "swimlane" },
  { kind: "text", label: "text" },
  { kind: "placeholder", label: "placeholder" },
];

export const allKindsDiagram: PlacedDiagram = {
  width: 900,
  height: 700,
  nodes: kindSpecs.map((spec, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const node: PlacedDiagram["nodes"][0] = {
      id: `k${i}`,
      kind: spec.kind,
      x: 40 + col * 210,
      y: 40 + row * 160,
      width: spec.kind === "text" ? 160 : 120,
      height: spec.kind === "swimlane" ? 120 : spec.kind === "actor" ? 100 : 70,
      label: spec.label,
      style: { fill: "#DAE8FC", stroke: "#6C8EBF", fontSize: 12 },
    };
    if (spec.kind === "swimlane") node.headerSize = 28;
    if (spec.kind === "placeholder") node.placeholderOf = "mxgraph.flowchart.database";
    return node;
  }),
  edges: [],
};
