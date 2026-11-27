/** The account's text size, in percent of the browser's. */
export const FONT_SCALE = { min: 90, max: 125, step: 5, default: 100 } as const;

/**
 * Applies the account's text size. Every font size is in rem, so the root size scales all text and
 * nothing else (spacing and layout stay). 100 removes the override, so the browser's own text size
 * applies unchanged.
 */
export function setFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = scale === FONT_SCALE.default ? "" : `${scale}%`;
}
