/**
 * The message catalog on disk, checked and turned into types.
 *
 * Files: `src/locales/<lang>/<namespace>.json` (shared terms) and
 * `src/modules/<module>/locales/<lang>.json` (namespace = module name). Keys are `<namespace>.<path>`.
 * German is the reference; every other language must have exactly its keys.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { baseCompile } from "@intlify/message-compiler";

import { DEFAULT_LOCALE, GLOSSARY_TERMS, RULESET_EDITIONS, SUPPORTED_LOCALES } from "@dnd/i18n";

type Messages = { [key: string]: string | Messages };

/** locale → namespace → { file, messages } */
export type Catalog = Map<string, Map<string, { file: string; messages: Messages }>>;

export type CatalogReport = { errors: string[]; warnings: string[] };

function readJson(file: string): Messages {
  return JSON.parse(readFileSync(file, "utf8")) as Messages;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function loadCatalog(srcDir: string): Catalog {
  const catalog: Catalog = new Map();
  const add = (locale: string, namespace: string, file: string) => {
    const namespaces = catalog.get(locale) ?? new Map();
    namespaces.set(namespace, { file: relative(srcDir, file), messages: readJson(file) });
    catalog.set(locale, namespaces);
  };

  const localesDir = join(srcDir, "locales");
  if (isDirectory(localesDir)) {
    for (const locale of readdirSync(localesDir).filter((name) => isDirectory(join(localesDir, name)))) {
      for (const file of readdirSync(join(localesDir, locale)).filter((name) => name.endsWith(".json"))) {
        add(locale, basename(file, ".json"), join(localesDir, locale, file));
      }
    }
  }

  const modulesDir = join(srcDir, "modules");
  if (isDirectory(modulesDir)) {
    for (const module of readdirSync(modulesDir)) {
      const dir = join(modulesDir, module, "locales");
      if (!isDirectory(dir)) continue;
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
        add(basename(file, ".json"), module, join(dir, file));
      }
    }
  }

  return catalog;
}

export function flattenKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

function keysOf(catalog: Catalog, locale: string): Set<string> {
  const keys = new Set<string>();
  for (const [namespace, { messages }] of catalog.get(locale) ?? []) {
    for (const key of flattenKeys(messages, namespace)) keys.add(key);
  }
  return keys;
}

/** Placeholders like `{count}` must be the same in every language. */
function placeholders(message: string): string {
  return [...message.matchAll(/\{\s*(\w+)\s*\}/g)].map((match) => match[1]).sort().join(",");
}

/** Syntax errors as vue-i18n's compiler reports them (unclosed braces, bad linked messages …). */
export function syntaxErrors(message: string): string[] {
  const errors: string[] = [];
  baseCompile(message, { onError: (error) => errors.push(error.message), location: false });
  return errors;
}

function messageAt(catalog: Catalog, locale: string, key: string): string | undefined {
  const [namespace, ...path] = key.split(".");
  let node: string | Messages | undefined = catalog.get(locale)?.get(namespace ?? "")?.messages;
  for (const part of path) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

/**
 * Keys used in source: literal first arguments of `t`, `te`, `tm`, `$t` and `keypath="…"`.
 * Keys built at runtime are declared with a comment `// i18n-dynamic: errors.*` next to their use.
 */
export function scanSource(srcDir: string): { used: Set<string>; dynamic: string[] } {
  const used = new Set<string>();
  const dynamic: string[] = [];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (isDirectory(path)) return name === "generated" ? [] : walk(path);
      return /\.(vue|ts)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
    });

  for (const file of walk(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\b\$?(?:t|te|tm|rt)\(\s*["'`]([\w.-]+)["'`]/g)) used.add(match[1]!);
    for (const match of text.matchAll(/\bkeypath="([\w.-]+)"/g)) used.add(match[1]!);
    for (const match of text.matchAll(/i18n-dynamic:\s*([\w.*-]+(?:\s*,\s*[\w.*-]+)*)/g)) {
      dynamic.push(...match[1]!.split(",").map((pattern) => pattern.trim()));
    }
  }

  return { used, dynamic };
}

function matchesDynamic(key: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith(".*") ? key.startsWith(pattern.slice(0, -1)) : key === pattern,
  );
}

export function checkCatalog(srcDir: string): CatalogReport {
  const catalog = loadCatalog(srcDir);
  const errors: string[] = [];
  const warnings: string[] = [];
  const reference = keysOf(catalog, DEFAULT_LOCALE);

  for (const locale of catalog.keys()) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      errors.push(`Unknown locale "${locale}" (supported: ${SUPPORTED_LOCALES.join(", ")})`);
    }
  }

  for (const locale of SUPPORTED_LOCALES.filter((value) => value !== DEFAULT_LOCALE)) {
    const keys = keysOf(catalog, locale);
    for (const key of reference) {
      if (!keys.has(key)) {
        errors.push(`${locale}: missing "${key}"`);
        continue;
      }
      const expected = placeholders(messageAt(catalog, DEFAULT_LOCALE, key) ?? "");
      if (placeholders(messageAt(catalog, locale, key) ?? "") !== expected) {
        errors.push(`${locale}: "${key}" must use the placeholders {${expected}}`);
      }
    }
    for (const key of keys) if (!reference.has(key)) errors.push(`${locale}: "${key}" is not in ${DEFAULT_LOCALE}`);
  }

  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keysOf(catalog, locale)) {
      for (const error of syntaxErrors(messageAt(catalog, locale, key) ?? "")) {
        errors.push(`${locale}: "${key}" doesn't compile: ${error}`);
      }
    }
  }

  for (const locale of SUPPORTED_LOCALES) {
    const glossary = catalog.get(locale)?.get("glossary")?.messages;
    const terms = glossary?.terms;
    for (const term of GLOSSARY_TERMS) {
      if (typeof terms !== "object" || typeof terms[term] !== "string") {
        errors.push(`${locale}: glossary term "${term}" is missing`);
      }
    }
    const editions = glossary?.editions;
    for (const [edition, overrides] of typeof editions === "object" ? Object.entries(editions) : []) {
      if (!(RULESET_EDITIONS as readonly string[]).includes(edition)) {
        errors.push(`${locale}: glossary edition "${edition}" is unknown`);
      }
      for (const term of typeof overrides === "object" ? Object.keys(overrides) : []) {
        if (!(GLOSSARY_TERMS as readonly string[]).includes(term)) {
          errors.push(`${locale}: glossary override "${edition}.${term}" names no glossary term`);
        }
      }
    }
  }

  const { used, dynamic } = scanSource(srcDir);
  for (const key of used) {
    if (!reference.has(key)) errors.push(`source uses "${key}", which ${DEFAULT_LOCALE} doesn't define`);
  }
  // The glossary is read by term name (`useGlossary`), never by a literal key.
  for (const key of reference) {
    if (!used.has(key) && !key.startsWith("glossary.") && !matchesDynamic(key, dynamic)) {
      warnings.push(`unused "${key}"`);
    }
  }

  return { errors, warnings };
}

/** `MessageSchema` for vue-i18n, derived from the German files. */
export function renderTypes(srcDir: string, outFile: string): string {
  const namespaces = [...(loadCatalog(srcDir).get(DEFAULT_LOCALE) ?? new Map())].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const outDir = join(outFile, "..");
  const lines = namespaces.map(([namespace, { file }]) => {
    const path = relative(outDir, join(srcDir, file)).split("\\").join("/");
    return `  ${JSON.stringify(namespace)}: typeof import(${JSON.stringify(path)});`;
  });

  return [
    "// Generated by `npm run i18n:types` from the German message files. Do not edit.",
    "",
    "export type MessageSchema = {",
    ...lines,
    "};",
    "",
  ].join("\n");
}
