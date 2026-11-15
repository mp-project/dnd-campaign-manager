/**
 * `npm run i18n:check`: all languages have the same keys and placeholders, every key used in source
 * exists, the glossary is complete; unused keys are reported as warnings.
 * `npm run i18n:types`: writes the message types derived from the German files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkCatalog, renderTypes } from "./i18nCatalog.ts";

const root = join(import.meta.dirname, "..");
const srcDir = join(root, "src");
const typesFile = join(srcDir, "core/i18n/generated/messages.d.ts");

const command = process.argv[2];

if (command === "types") {
  writeFileSync(typesFile, renderTypes(srcDir, typesFile));
  console.info(`Message types written to ${typesFile}`);
} else if (command === "check") {
  const { errors, warnings } = checkCatalog(srcDir);
  const expectedTypes = renderTypes(srcDir, typesFile);
  let currentTypes = "";
  try {
    currentTypes = readFileSync(typesFile, "utf8");
  } catch {
    // reported below
  }
  if (currentTypes !== expectedTypes) errors.push("message types are stale: run npm run i18n:types");

  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
  console.info(`i18n: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exitCode = 1;
} else {
  console.error("usage: node scripts/i18n.ts check|types");
  process.exitCode = 1;
}
