import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Bundled Noto Sans SC (OFL), resolved relative to this module (src/ or dist/). */
export const NOTO_SANS_SC_REGULAR = join(REPO_ROOT, "assets/fonts/NotoSansSC-Regular.otf");
export const NOTO_SANS_SC_BOLD = join(REPO_ROOT, "assets/fonts/NotoSansSC-Bold.otf");

export function bundledFontFiles(): string[] {
  const files = [NOTO_SANS_SC_REGULAR, NOTO_SANS_SC_BOLD];
  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`Bundled font missing: ${file}`);
    }
  }
  return files;
}
