import type { Locale } from "@dnd/i18n";
import { DEFAULT_LOCALE } from "@dnd/i18n";

import { type MessageTree, pseudoLocalize } from "@/core/i18n/pseudo";

type Loader = () => Promise<MessageTree>;

/*
 * Every message file is its own lazy chunk, so only the active language is downloaded.
 * Shared files: `src/locales/<lang>/<namespace>.json`; modules: `src/modules/<module>/locales/<lang>.json`.
 */
const sharedFiles = import.meta.glob<MessageTree>("../../locales/*/*.json", { import: "default" });
const moduleFiles = import.meta.glob<MessageTree>("../../modules/*/locales/*.json", { import: "default" });

function loadersFor(locale: Locale): Array<[namespace: string, load: Loader]> {
  const shared = Object.entries(sharedFiles).flatMap(([path, load]) => {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    return match?.[1] === locale ? [[match[2]!, load] as [string, Loader]] : [];
  });
  const modules = Object.entries(moduleFiles).flatMap(([path, load]) => {
    const match = /\/modules\/([^/]+)\/locales\/([^/]+)\.json$/.exec(path);
    return match?.[2] === locale ? [[match[1]!, load] as [string, Loader]] : [];
  });
  return [...shared, ...modules];
}

/**
 * All messages of one language, namespaced by file (`common`, `errors`, …) or module name.
 * A file that can't be loaded is left out (its texts fall back to German); only when nothing at
 * all could be loaded does this reject.
 */
export async function loadMessages(locale: Locale): Promise<MessageTree> {
  const loaders = loadersFor(locale);
  const results = await Promise.allSettled(
    loaders.map(async ([namespace, load]) => [namespace, await load()] as const),
  );
  const loaded = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

  if (loaders.length > 0 && loaded.length === 0) {
    throw new Error(`No message file of "${locale}" could be loaded`);
  }
  if (import.meta.env.DEV) {
    for (const result of results) {
      if (result.status === "rejected") console.warn(`[i18n] a message file of "${locale}" failed`, result.reason);
    }
  }
  return Object.fromEntries(loaded);
}

/** The pseudo language is built from the reference language, so it always has every key. */
export async function loadPseudoMessages(): Promise<MessageTree> {
  return pseudoLocalize(await loadMessages(DEFAULT_LOCALE));
}
