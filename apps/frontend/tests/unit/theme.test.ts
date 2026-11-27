import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../../src");
// The only file that may define raw colors: the theme tokens.
const THEME_FILE = "styles/main.css";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sourceFiles(path);
    return /\.(vue|ts|css)$/.test(name) ? [path] : [];
  });
}

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const ARBITRARY_COLOR_CLASS =
  /\b(?:bg|text|border|from|via|to|ring|fill|stroke|outline|decoration|shadow|accent|caret)-\[[^\]]*(?:#|rgb|hsl|gradient)/;

// Font sizes in rem follow the browser's text size and the account's font scale; px would not.
const PX_FONT_SIZE = /\btext-\[[^\]]*\d(?:\.\d+)?px[^\]]*\]|font-?[sS]ize:[^;,}\n]*\d(?:\.\d+)?px/;

describe("theme", () => {
  const files = sourceFiles(SRC).filter((path) => relative(SRC, path) !== THEME_FILE);

  it("sizes text in rem everywhere, the theme included", () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => PX_FONT_SIZE.test(line))
        .map(({ index }) => `${relative(SRC, path)}:${index + 1}`),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps raw color values out of components, views and scripts", () => {
    const offenders = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => RAW_COLOR.test(line) || ARBITRARY_COLOR_CLASS.test(line))
        .map(({ index }) => `${relative(SRC, path)}:${index + 1}`),
    );

    expect(offenders).toEqual([]);
  });

  it("defines the clickdummy tokens in the theme", () => {
    const theme = readFileSync(join(SRC, THEME_FILE), "utf8");

    for (const token of [
      "--color-navy-950",
      "--color-parchment",
      "--color-ink",
      "--color-primary",
      "--color-gold",
      "--font-heading",
      "--radius-card",
      "--breakpoint-md",
    ]) {
      expect(theme).toContain(`${token}:`);
    }
  });
});
