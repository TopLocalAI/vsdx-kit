import { NOTO_SANS_SC_BOLD, NOTO_SANS_SC_REGULAR } from "./bundled-fonts.js";
import { loadFontAdvances } from "./otf-metrics.js";

/** Fallback width model when the bundled font cannot be read. */
const LATIN_EM = 0.62;
const CJK_EM = 1.02;
const WORD_SPACE_EM = 0.35;

function isCjkChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code > 0x2e80;
}

/** Width of one character in em, from the bundled Noto Sans SC (real advances). */
function charEm(ch: string, bold: boolean): number {
  const font = loadFontAdvances(bold ? NOTO_SANS_SC_BOLD : NOTO_SANS_SC_REGULAR);
  const cp = ch.codePointAt(0) ?? 32;
  const adv = font?.advance(cp);
  if (font && adv !== undefined) return adv / font.unitsPerEm;
  if (isCjkChar(ch)) return CJK_EM;
  return bold ? LATIN_EM * 1.05 : LATIN_EM;
}

export function measureTextWidthPx(text: string, fontPx: number, bold = false): number {
  let width = 0;
  for (const ch of text) width += charEm(ch, bold) * fontPx;
  return width;
}

export function wordSpacePx(fontPx: number): number {
  const font = loadFontAdvances(NOTO_SANS_SC_REGULAR);
  const adv = font?.advance(32);
  return font && adv !== undefined ? (adv / font.unitsPerEm) * fontPx : fontPx * WORD_SPACE_EM;
}

export function isLatinWord(word: string): boolean {
  return /^[\x20-\x7E]+$/u.test(word);
}

const CLOSING_PUNCT = /^[，。、；：？！）」』】》,.;:?!)\]}%…]$/u;

interface WrapToken {
  text: string;
  spaceBefore: boolean;
  /** CJK glyph runs can break between any characters. */
  cjk: boolean;
}

function tokenize(paragraph: string): WrapToken[] {
  const tokens: WrapToken[] = [];
  let word = "";
  let pendingSpace = false;
  const flushWord = () => {
    if (word) tokens.push({ text: word, spaceBefore: pendingSpace, cjk: false });
    if (word) pendingSpace = false;
    word = "";
  };
  for (const ch of paragraph) {
    if (/\s/u.test(ch)) {
      flushWord();
      if (tokens.length) pendingSpace = true;
      continue;
    }
    if (CLOSING_PUNCT.test(ch) && !word && tokens.length && !pendingSpace) {
      tokens[tokens.length - 1]!.text += ch;
      continue;
    }
    if (isCjkChar(ch)) {
      flushWord();
      tokens.push({ text: ch, spaceBefore: pendingSpace, cjk: true });
      pendingSpace = false;
      continue;
    }
    word += ch;
  }
  flushWord();
  return tokens;
}

export interface WrapOptions {
  /** Break Latin words that are wider than the line (last resort). */
  breakLongWords?: boolean;
}

/**
 * Greedy wrap: respects \n; Latin text breaks at spaces, CJK between glyphs.
 * With breakLongWords, words wider than the line are split by character.
 */
export function wrapTextLines(
  text: string,
  maxWidthPx: number,
  fontPx: number,
  bold = false,
  opts: WrapOptions = {},
): string[] {
  const width = Math.max(1, maxWidthPx);
  const lines: string[] = [];
  const fits = (s: string) => measureTextWidthPx(s, fontPx, bold) <= width + 0.01;

  for (const paragraph of text.split("\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    if (fits(trimmed)) {
      lines.push(trimmed);
      continue;
    }
    let current = "";
    const placeLong = (token: string) => {
      // token alone does not fit
      if (!opts.breakLongWords) {
        if (current) lines.push(current);
        current = token;
        return;
      }
      let run = current;
      for (const ch of token) {
        if (run && !fits(run + ch)) {
          lines.push(run);
          run = ch;
        } else run += ch;
      }
      current = run;
    };
    for (const tok of tokenize(trimmed)) {
      const joiner = current && tok.spaceBefore ? " " : "";
      const candidate = current + joiner + tok.text;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (fits(tok.text)) {
        if (current) lines.push(current);
        current = tok.text;
        continue;
      }
      if (current && !opts.breakLongWords) {
        lines.push(current);
        current = "";
      }
      if (opts.breakLongWords && current && joiner) current += " ";
      placeLong(tok.text);
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : [""];
}
