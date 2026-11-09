export type ShapeKind =
  | "rect"
  | "roundedRect"
  | "diamond"
  | "ellipse"
  | "cylinder"
  | "note"
  | "hexagon"
  | "component"
  | "actor"
  | "container"
  | "swimlane"
  | "text"
  | "placeholder"
  | "image";

export interface PlacedImage {
  mime: "image/png" | "image/jpeg";
  data: Uint8Array;
  pixelWidth?: number;
  pixelHeight?: number;
}

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  fontColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  opacity?: number;
  /** Background behind a connector label (set at render time). */
  labelBackground?: string;
}

/** Edge end markers (preview + Visio BeginArrow/EndArrow). */
export type ArrowKind =
  | "none"
  | "block"
  | "classic"
  | "open"
  | "triangle"
  | "tee"
  | "diamond"
  | "circle"
  | "openCircle";

/** Second text run of a node (subtitle) with its own size / colour. */
export interface SubLabel {
  text: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
}

/** Framed badge behind an edge label (e.g. 是/否 in a small rounded box). */
export interface LabelBox {
  fill?: string;
  stroke?: string;
  fontColor?: string;
  rounded?: boolean;
}

export interface PlacedNode {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  style?: Style;
  parentId?: string;
  headerSize?: number;
  /** Swimlane title bar: top (horizontal=1) or left (horizontal=0). */
  headerSide?: "top" | "left";
  placeholderOf?: string;
  /**
   * Pre-wrapped text lines. Preview and vsdx both draw these lines at
   * style.fontSize inside nodeTextArea(), so they match exactly.
   */
  textLines?: string[];
  /** Secondary text (subtitle lines below the label, own size/colour). */
  subLabel?: SubLabel;
  /** Pre-wrapped subtitle lines, drawn at subLabel.fontSize. */
  subLines?: string[];
  /**
   * Vertical band (px offsets from the node's top) reserved for the label when
   * the shape also contains other shapes (heading above / caption below them).
   */
  textBand?: { top: number; bottom: number; left?: number; right?: number };
  image?: PlacedImage;
  /**
   * Corner radius in px (rect / roundedRect / container), overrides the default rounding of roundedRect.
   */
  cornerRadius?: number;
  /** Background picture: drawn right after containers, under every other shape. */
  background?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  /** Clockwise degrees */
  rotation?: number;
}

export interface PlacedEdge {
  id: string;
  source?: string;
  target?: string;
  sourcePoint?: { x: number; y: number };
  targetPoint?: { x: number; y: number };
  waypoints?: { x: number; y: number }[];
  label?: string;
  style?: Style & {
    endArrow?: ArrowKind;
    startArrow?: ArrowKind;
    orthogonal?: boolean;
    /**
     * Smooth curve through the waypoints (implies orthogonal=false). A single
     * waypoint gives a circular arc through it.
     */
    curved?: boolean;
    /** Straight (possibly diagonal) segments between waypoints, no orthogonal fix-ups. */
    straight?: boolean;
    exitX?: number;
    exitY?: number;
    entryX?: number;
    entryY?: number;
  };
  /** Draw the label in a framed badge instead of on a plain background. */
  labelBox?: LabelBox;
  /** draw.io edge label position along path, -1..1 (0 = midpoint). */
  labelRelativeX?: number;
  labelOffset?: { x: number; y: number };
  /**
   * Label rotation in degrees, clockwise on the page (y down), kept upright
   * (-90…90): set for labels that run along a slanted segment.
   */
  labelAngle?: number;
}

export interface PlacedDiagram {
  title?: string;
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}
