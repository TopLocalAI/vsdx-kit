// Regenerates examples/output/*.vsdx and docs/examples/*.png from examples/*.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawioToVsdx, inspectVsdx, jsonToVsdx, toPng } from "../src/index.js";
import { readDiagramFile } from "../src/io.js";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const examples = join(root, "examples");
const outDir = join(examples, "output");
const pngDir = join(root, "docs/examples");
mkdirSync(outDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });

for (const file of readdirSync(examples).sort()) {
  const ext = extname(file);
  if (ext !== ".json" && ext !== ".drawio") continue;
  const stem = basename(file, ext);
  const path = join(examples, file);
  let vsdx: Uint8Array;
  let png: Uint8Array;
  if (ext === ".json") {
    const diagram = readDiagramFile(path);
    vsdx = await jsonToVsdx(diagram);
    png = await toPng(diagram);
  } else {
    const xml = readFileSync(path, "utf8");
    vsdx = await drawioToVsdx(xml);
    png = await toPng(xml);
  }
  writeFileSync(join(outDir, `${stem}.vsdx`), vsdx);
  writeFileSync(join(pngDir, `${stem}.png`), png);
  const info = await inspectVsdx(vsdx);
  console.log(
    `${file}: ${info.pages.length} page(s), ${info.shapes} shapes, ${info.connectors} connectors, ` +
      `${info.pages.reduce((s, p) => s + p.glued, 0)} glued ends, ${info.pages.reduce((s, p) => s + p.images, 0)} images`,
  );
}
