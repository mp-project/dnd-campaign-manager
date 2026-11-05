import MarkdownIt from "markdown-it";

import { NOTE_CONTENT_FORMATS } from "#src/modules/notes/domain/entities/NotesTable";

export type NoteContentFormat = (typeof NOTE_CONTENT_FORMATS)[number];

/**
 * Notes are stored as typed and made safe when they are shown. Raw HTML is escaped instead of
 * passed on (`html: false`), so Markdown only yields its own fixed set of tags, and markdown-it
 * refuses links to `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs. Links open
 * without access to the app window.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];

  token?.attrSet("rel", "noopener noreferrer nofollow");
  token?.attrSet("target", "_blank");

  return defaultLinkOpen(tokens, index, options, env, self);
};

/**
 * The only HTML clients may insert. `content` and `gmNotes` stay raw text and must be shown as
 * text. Plain text keeps its paragraphs and line breaks.
 */
export function renderSafeMarkdown(format: NoteContentFormat, content: string): string {
  if (format === "MARKDOWN") {
    return markdown.render(content);
  }

  return content
    // Without `\s` between the breaks, so a line of spaces cannot make splitting slow.
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${markdown.utils.escapeHtml(paragraph).replace(/\r?\n/g, "<br>\n")}</p>\n`)
    .join("");
}
