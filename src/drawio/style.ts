/** Parse draw.io semicolon styles; `image=` values may contain `;` (e.g. `data:...;base64,...`). */
export function parseDrawioStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;

  let main = style;
  const imageSep = ";image=";
  const imageIdx = style.indexOf(imageSep);
  if (imageIdx >= 0) {
    out.image = style.slice(imageIdx + imageSep.length);
    main = style.slice(0, imageIdx);
  } else if (style.startsWith("image=")) {
    out.image = style.slice("image=".length);
    main = "";
  }

  for (const part of main.split(";")) {
    const eq = part.indexOf("=");
    if (eq >= 0) out[part.slice(0, eq)] = part.slice(eq + 1);
    else if (part) out[part] = "1";
  }
  return out;
}
