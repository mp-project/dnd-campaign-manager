/**
 * Attributes of a component without `class` and `style`: for inputs that put class/style on their
 * wrapper and every other attribute (aria-*, autocomplete …) on the inner element.
 */
export function withoutClassAndStyle(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== "class" && name !== "style"));
}
