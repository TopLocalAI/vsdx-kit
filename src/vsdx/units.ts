/** draw.io VsdxExport.CONVERSION_FACTOR — px per inch at 96 dpi scale used by mxGraph page coords. */
export const PX_PER_INCH = 101.6;

export function inch(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

export function pxToInX(xPx: number): number {
  return inch(xPx / PX_PER_INCH);
}

/** mxGraph y-down px → Visio page y-up inches (page height in inches). */
export function pxToInY(yPx: number, pageHeightIn: number): number {
  return inch(pageHeightIn - yPx / PX_PER_INCH);
}

export interface ShapeBox {
  pinX: number;
  pinY: number;
  width: number;
  height: number;
  locPinX: number;
  locPinY: number;
}

export function boxFromPx(
  x: number,
  y: number,
  w: number,
  h: number,
  pageHeightIn: number,
): ShapeBox {
  const width = pxToInX(w);
  const height = pxToInX(h);
  const pinX = pxToInX(x + w / 2);
  const pinY = pxToInY(y + h / 2, pageHeightIn);
  return {
    pinX,
    pinY,
    width,
    height,
    locPinX: inch(width / 2),
    locPinY: inch(height / 2),
  };
}

export function pageHeightInFromDiagram(heightPx: number): number {
  return pxToInX(heightPx);
}
