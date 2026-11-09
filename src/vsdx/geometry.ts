import type { Style } from "../types.js";
import { inch, pxToInX } from "./units.js";

/** Target corner radius visible in LibreOffice (~8 px at 96 dpi page scale). */
const ROUNDED_RECT_RADIUS_PX = 8;

export function rectGeometry(): string {
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

export function roundedRectExtra(widthIn: number, heightIn: number, arcSizePct = 12): string {
  const minIn = Math.min(widthIn, heightIn);
  const pctIn = inch((minIn * arcSizePct) / 100);
  const minVisibleIn = pxToInX(ROUNDED_RECT_RADIUS_PX);
  const rounding = inch(Math.max(minVisibleIn, pctIn));
  return `<Cell N="Rounding" V="${rounding}"/>`;
}

export function diamondGeometry(): string {
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0.5"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0.5"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="0.5"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="0.5"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0.5"/><Cell N="Y" V="1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

export function ellipseGeometry(widthIn: number, heightIn: number): string {
  const cx = inch(widthIn / 2);
  const cy = inch(heightIn / 2);
  const h = inch(heightIn);
  return `<Section N="Geometry" IX="0"><Row T="Ellipse" IX="1"><Cell N="X" V="${cx}" F="Width*0.5"/><Cell N="Y" V="${cy}" F="Height*0.5"/><Cell N="A" V="0" F="Width*0"/><Cell N="B" V="${cy}" F="Height*0.5"/><Cell N="C" V="${cx}" F="Width*0.5"/><Cell N="D" V="${h}" F="Height*1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

/**
 * Cylinder: body with a curved bottom, plus the front edge of the top cap.
 * EllipticalArcTo uses absolute local coordinates: X/Y = end point, A/B = a point on the arc,
 * C = major-axis angle, D = major/minor axis ratio.
 */
export function cylinderGeometry(widthIn: number, heightIn: number): string {
  const w = widthIn;
  const h = heightIn;
  const ry = h * 0.1;
  const v = (n: number) => inch(n);
  const ratio = v(w / 2 / ry);
  const arc = (
    ix: number,
    x: number,
    xf: string,
    y: number,
    yf: string,
    a: number,
    af: string,
    b: number,
    bf: string,
  ) =>
    `<Row T="EllipticalArcTo" IX="${ix}"><Cell N="X" V="${v(x)}" F="${xf}"/><Cell N="Y" V="${v(y)}" F="${yf}"/><Cell N="A" V="${v(a)}" F="${af}"/><Cell N="B" V="${v(b)}" F="${bf}"/><Cell N="C" V="0"/><Cell N="D" V="${ratio}" F="Width*0.5/(Height*0.1)"/></Row>`;
  const pt = (t: string, ix: number, x: number, xf: string, y: number, yf: string) =>
    `<Row T="${t}" IX="${ix}"><Cell N="X" V="${v(x)}" F="${xf}"/><Cell N="Y" V="${v(y)}" F="${yf}"/></Row>`;
  const body =
    pt("MoveTo", 1, 0, "Width*0", h - ry, "Height*0.9") +
    pt("LineTo", 2, 0, "Width*0", ry, "Height*0.1") +
    arc(3, w, "Width*1", ry, "Height*0.1", w / 2, "Width*0.5", 0, "Height*0") +
    pt("LineTo", 4, w, "Width*1", h - ry, "Height*0.9") +
    arc(5, 0, "Width*0", h - ry, "Height*0.9", w / 2, "Width*0.5", h, "Height*1");
  const capFront =
    pt("MoveTo", 1, 0, "Width*0", h - ry, "Height*0.9") +
    arc(2, w, "Width*1", h - ry, "Height*0.9", w / 2, "Width*0.5", h - 2 * ry, "Height*0.8");
  return `<Section N="Geometry" IX="0">${body}<Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section><Section N="Geometry" IX="1">${capFront}<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
}

export function noteGeometry(): string {
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="0.85"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="0.85"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="6"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

/** Flat-sided hexagon (left/right points), 20% inset like draw.io's hexagon. */
export function hexagonGeometry(): string {
  const pts: [number, number][] = [
    [0.2, 1],
    [0.8, 1],
    [1, 0.5],
    [0.8, 0],
    [0.2, 0],
    [0, 0.5],
    [0.2, 1],
  ];
  const rows = pts
    .map(
      ([x, y], i) =>
        `<Row T="${i === 0 ? "RelMoveTo" : "RelLineTo"}" IX="${i + 1}"><Cell N="X" V="${x}"/><Cell N="Y" V="${y}"/></Row>`,
    )
    .join("");
  return `<Section N="Geometry" IX="0">${rows}<Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

/** Simple parallelogram for component shape. */
export function componentGeometry(): string {
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0.15"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="0.85"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0.15"/><Cell N="Y" V="0"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section>`;
}

/** Stick figure actor (head + body). Visio local coordinates are y-up. */
export function actorGeometry(widthIn: number, heightIn: number): string {
  const w = widthIn;
  const h = heightIn;
  const v = (n: number) => inch(n);
  const head = `<Row T="Ellipse" IX="1"><Cell N="X" V="${v(w * 0.5)}" F="Width*0.5"/><Cell N="Y" V="${v(h * 0.85)}" F="Height*0.85"/><Cell N="A" V="${v(w * 0.3)}" F="Width*0.3"/><Cell N="B" V="${v(h * 0.85)}" F="Height*0.85"/><Cell N="C" V="${v(w * 0.5)}" F="Width*0.5"/><Cell N="D" V="${v(h)}" F="Height*1"/></Row>`;
  const seg = (ix: number, x1: number, y1: number, x2: number, y2: number) =>
    `<Row T="RelMoveTo" IX="${ix}"><Cell N="X" V="${x1}"/><Cell N="Y" V="${y1}"/></Row><Row T="RelLineTo" IX="${ix + 1}"><Cell N="X" V="${x2}"/><Cell N="Y" V="${y2}"/></Row>`;
  const body =
    seg(1, 0.5, 0.7, 0.5, 0.35) +
    seg(3, 0.5, 0.58, 0.2, 0.48) +
    seg(5, 0.5, 0.58, 0.8, 0.48) +
    seg(7, 0.5, 0.35, 0.28, 0) +
    seg(9, 0.5, 0.35, 0.72, 0);
  return `<Section N="Geometry" IX="0">${head}<Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section><Section N="Geometry" IX="1">${body}<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
}

export function swimlaneGeometryTop(headerFraction: number): string {
  const hf = Math.min(0.4, Math.max(0.05, headerFraction));
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section><Section N="Geometry" IX="1"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="${1 - hf}" F="Height*${1 - hf}"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="${1 - hf}" F="Height*${1 - hf}"/></Row><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
}

/** Vertical swimlane (draw.io horizontal=0): title bar on the left. */
export function swimlaneGeometryLeft(headerWidthFraction: number): string {
  const wf = Math.min(0.35, Math.max(0.02, headerWidthFraction));
  return `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="0"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section><Section N="Geometry" IX="1"><Row T="RelMoveTo" IX="1"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="0"/></Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/></Section><Section N="Geometry" IX="2"><Row T="RelMoveTo" IX="1"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="${wf}" F="Width*${wf}"/><Cell N="Y" V="0"/></Row><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>`;
}

/** @deprecated use swimlaneGeometryTop */
export function swimlaneGeometry(headerFraction: number): string {
  return swimlaneGeometryTop(headerFraction);
}

export function placeholderGeometry(): string {
  return rectGeometry();
}

export function strokeWidthCell(style?: Style): string {
  if (!style?.strokeWidth) return "";
  return `<Cell N="LineWeight" V="${inch(style.strokeWidth / 101.6)}"/>`;
}

export function fillStrokeCells(style?: Style, defaultFill = "#ffffff"): string {
  const fill = style?.fill && style.fill !== "none" ? style.fill : defaultFill;
  const stroke = style?.stroke && style.stroke !== "none" ? style.stroke : "#222222";
  const noFill = style?.fill === "none" ? `<Cell N="FillPattern" V="0"/>` : "";
  const noLine = style?.stroke === "none" ? `<Cell N="LinePattern" V="0"/>` : "";
  return `<Cell N="FillForegnd" V="${fill}"/><Cell N="LineColor" V="${stroke}"/>${noFill}${noLine}`;
}

export function pxStrokeWidth(style?: Style): string {
  if (!style?.strokeWidth) return "";
  return `<Cell N="LineWeight" V="${pxToInX(style.strokeWidth)}"/>`;
}
