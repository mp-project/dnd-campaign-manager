/** Formats of stored text content; modules use these values for their format columns. */
export const TEXT_CONTENT_FORMATS = ["MARKDOWN", "PLAIN_TEXT"] as const;

export type TextContentFormat = (typeof TEXT_CONTENT_FORMATS)[number];
