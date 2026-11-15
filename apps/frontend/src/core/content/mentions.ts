import type { InjectionKey } from "vue";

import type { IconName } from "@/components/base/iconNames";

/**
 * Mentions in texts are stored as `@[Display name](type:id)`, e.g. `@[Hauptmann Rovan](npc:42)`.
 * Anything that doesn't match exactly stays plain text, so a broken mention never breaks a text.
 */
export type MentionRef = { name: string; type: string; id: string };

export type TextPart = { text: string } | { mention: MentionRef };

const MENTION = /@\[([^\]\n]+)\]\(([a-z][a-z0-9-]*):([A-Za-z0-9_-]+)\)/g;

export function parseMentions(text: string | null | undefined): TextPart[] {
  if (!text) return [];
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ mention: { name: match[1]!, type: match[2]!, id: match[3]! } });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** What the preview card of a mention shows. */
export type MentionTarget = {
  name: string;
  typeLabel: string;
  summary?: string;
  icon?: IconName;
  image?: string;
  /** Persons and characters show a round picture. */
  round?: boolean;
  gmOnly?: boolean;
};

/**
 * Resolves mentions to their current content (provided by the search module). `null`: the target is
 * gone or hidden; `undefined`: not known (yet), the stored name is shown.
 */
export type MentionResolver = (ref: MentionRef) => MentionTarget | null | undefined;

export const MENTION_RESOLVER: InjectionKey<MentionResolver> = Symbol("mentionResolver");

/** Opens a mentioned content (the page decides how: detail page, drawer, game table insert). */
export const MENTION_OPENER: InjectionKey<(ref: MentionRef) => void> = Symbol("mentionOpener");
