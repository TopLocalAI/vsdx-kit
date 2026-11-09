import { existsSync } from "node:fs";
import { bundledFontFiles } from "./bundled-fonts.js";
import { RESVG_DEFAULT_FONT_FAMILY } from "./constants.js";

/** Family name resvg matches when SVG uses our stack (see constants.ts). */
export { RESVG_DEFAULT_FONT_FAMILY };
export const RESVG_LATIN_FONT_FAMILY = RESVG_DEFAULT_FONT_FAMILY;

let resolvedFontFiles: string[] | null = null;

function fontsFromEnv(): string[] | undefined {
  const raw = process.env.VSDX_KIT_FONT_FILES;
  if (!raw) return undefined;
  const files = raw
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean);
  return files.length > 0 ? files : undefined;
}

export function resolveFontFiles(explicit?: string[], opts?: { preferCjk?: boolean }): string[] {
  void opts?.preferCjk;
  if (explicit && explicit.length > 0) {
    for (const file of explicit) {
      if (!existsSync(file)) {
        throw new Error(`Font file not found: ${file}`);
      }
    }
    return explicit;
  }
  const fromEnv = fontsFromEnv();
  if (fromEnv) {
    for (const file of fromEnv) {
      if (!existsSync(file)) {
        throw new Error(`VSDX_KIT_FONT_FILES entry not found: ${file}`);
      }
    }
    return fromEnv;
  }
  if (resolvedFontFiles) return resolvedFontFiles;
  const files = bundledFontFiles();
  resolvedFontFiles = files;
  return files;
}

export function resvgFontConfig(
  fontFiles?: string[],
  opts?: { preferCjk?: boolean },
): {
  loadSystemFonts: boolean;
  fontFiles: string[];
  defaultFontFamily: string;
  sansSerifFamily: string;
} {
  void opts?.preferCjk;
  const files = resolveFontFiles(fontFiles);
  return {
    loadSystemFonts: false,
    fontFiles: files,
    defaultFontFamily: RESVG_DEFAULT_FONT_FAMILY,
    sansSerifFamily: RESVG_DEFAULT_FONT_FAMILY,
  };
}

/** Reset for tests only. */
export function resetFontCacheForTests(): void {
  resolvedFontFiles = null;
}

export function svgNeedsCjk(svg: string): boolean {
  return /[\u3040-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(svg);
}
