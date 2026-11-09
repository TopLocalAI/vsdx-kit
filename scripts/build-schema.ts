// Writes schema/diagram.schema.json from the zod schema in src/schema.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diagramJsonSchema } from "../src/schema.js";

const root = resolve(fileURLToPath(import.meta.url), "../..");
mkdirSync(resolve(root, "schema"), { recursive: true });
writeFileSync(
  resolve(root, "schema/diagram.schema.json"),
  `${JSON.stringify(diagramJsonSchema(), null, 2)}\n`,
);
console.log("schema/diagram.schema.json written");
