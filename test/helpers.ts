import JSZip from "jszip";

export const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function unzip(data: Uint8Array) {
  const zip = await JSZip.loadAsync(data);
  const text = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  return { zip, text, files: Object.keys(zip.files).filter((f) => !f.endsWith("/")) };
}
