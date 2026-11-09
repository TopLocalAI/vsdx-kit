import { z } from "zod";

/**
 * Public vsdx-kit diagram format (version 1).
 *
 * A small, stable JSON description of a diagram: nodes, edges and optional
 * groups. Positions are computed automatically (ELK layered layout), so a
 * diagram can be written by hand, by a script or by an AI agent.
 */

export const NODE_SHAPES = [
  "rect",
  "roundedRect",
  "ellipse",
  "circle",
  "diamond",
  "cylinder",
  "hexagon",
  "note",
  "actor",
  "text",
  "image",
] as const;

export type NodeShape = (typeof NODE_SHAPES)[number];

const color = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^none$/u, "Use #RGB, #RRGGBB or none")
  .describe('CSS hex colour such as "#DAE8FC", or "none".');

const id = z.string().min(1).max(128);

export const nodeSchema = z
  .object({
    id: id.describe("Unique node id, referenced by edges."),
    label: z
      .string()
      .max(2000)
      .optional()
      .describe("Text shown in the shape. Use \\n for line breaks."),
    shape: z.enum(NODE_SHAPES).optional().describe('Shape kind. Default "roundedRect".'),
    fill: color.optional().describe("Fill colour."),
    stroke: color.optional().describe("Border colour."),
    fontColor: color.optional().describe("Text colour."),
    fontSize: z.number().min(6).max(72).optional().describe("Font size in px. Default 13."),
    bold: z.boolean().optional(),
    dashed: z.boolean().optional().describe("Dashed border."),
    group: id.optional().describe("Id of the group (container) this node belongs to."),
    image: z
      .string()
      .optional()
      .describe(
        'Embedded picture for shape "image": a data URI (data:image/png;base64,…, JPEG or SVG). In the CLI a local file path also works.',
      ),
    width: z
      .number()
      .positive()
      .max(4000)
      .optional()
      .describe("Fixed width in px (default: fit text)."),
    height: z
      .number()
      .positive()
      .max(4000)
      .optional()
      .describe("Fixed height in px (default: fit text)."),
  })
  .strict();

export const edgeSchema = z
  .object({
    id: id.optional().describe("Optional edge id (default e1, e2, …)."),
    from: id.describe("Source node id."),
    to: id.describe("Target node id."),
    label: z.string().max(500).optional(),
    dashed: z.boolean().optional(),
    arrow: z
      .enum(["end", "start", "both", "none"])
      .optional()
      .describe('Arrowheads. Default "end".'),
    color: color.optional().describe("Line colour."),
  })
  .strict();

export const groupSchema = z
  .object({
    id: id.describe("Unique group id."),
    label: z.string().max(500).optional().describe("Title shown in the container header."),
    fill: color.optional(),
    stroke: color.optional(),
    parent: id.optional().describe("Id of an enclosing group (nested containers)."),
  })
  .strict();

export const diagramSchema = z
  .object({
    $schema: z.string().optional(),
    title: z
      .string()
      .max(500)
      .optional()
      .describe("Title drawn above the diagram; also the page name."),
    direction: z
      .enum(["right", "down", "left", "up"])
      .optional()
      .describe('Main flow direction. Default "right".'),
    nodes: z.array(nodeSchema).min(1).max(2000),
    edges: z.array(edgeSchema).max(5000).optional(),
    groups: z.array(groupSchema).max(500).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const nodeIds = new Set<string>();
    for (const [i, n] of d.nodes.entries()) {
      if (nodeIds.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate node id "${n.id}"`,
          path: ["nodes", i, "id"],
        });
      }
      nodeIds.add(n.id);
    }
    const groupIds = new Set<string>();
    for (const [i, g] of (d.groups ?? []).entries()) {
      if (groupIds.has(g.id) || nodeIds.has(g.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate id "${g.id}"`,
          path: ["groups", i, "id"],
        });
      }
      groupIds.add(g.id);
    }
    for (const [i, g] of (d.groups ?? []).entries()) {
      if (g.parent && !groupIds.has(g.parent)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown parent group "${g.parent}"`,
          path: ["groups", i, "parent"],
        });
      }
    }
    for (const [i, n] of d.nodes.entries()) {
      if (n.group && !groupIds.has(n.group)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown group "${n.group}"`,
          path: ["nodes", i, "group"],
        });
      }
      if (n.shape === "image" && !n.image) {
        ctx.addIssue({
          code: "custom",
          message: 'shape "image" needs an "image" data URI',
          path: ["nodes", i, "image"],
        });
      }
    }
    for (const [i, e] of (d.edges ?? []).entries()) {
      if (!nodeIds.has(e.from)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown node "${e.from}"`,
          path: ["edges", i, "from"],
        });
      }
      if (!nodeIds.has(e.to)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown node "${e.to}"`,
          path: ["edges", i, "to"],
        });
      }
    }
  });

export type DiagramNode = z.infer<typeof nodeSchema>;
export type DiagramEdge = z.infer<typeof edgeSchema>;
export type DiagramGroup = z.infer<typeof groupSchema>;
/** A vsdx-kit diagram (see schema/diagram.schema.json). */
export type Diagram = z.infer<typeof diagramSchema>;

export class DiagramValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(
      `Invalid diagram:\n${issues.map((i) => `  - ${i.path || "(root)"}: ${i.message}`).join("\n")}`,
    );
    this.name = "DiagramValidationError";
    this.issues = issues;
  }
}

/** Validate and return a diagram; throws DiagramValidationError with readable issues. */
export function parseDiagram(input: unknown): Diagram {
  const result = diagramSchema.safeParse(input);
  if (result.success) return result.data;
  throw new DiagramValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}

/** JSON Schema (draft 2020-12) of the diagram format. */
export function diagramJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(diagramSchema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://raw.githubusercontent.com/TopLocalAI/vsdx-kit/main/schema/diagram.schema.json",
    title: "vsdx-kit diagram",
    description:
      "A diagram for vsdx-kit: nodes, edges and optional groups. Layout is automatic. https://github.com/TopLocalAI/vsdx-kit",
    ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "$schema")),
  };
}
