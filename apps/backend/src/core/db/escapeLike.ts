/**
 * Escapes the LIKE wildcards (`%`, `_`) and the escape character itself, so user input in
 * `ilike(column, `%${escapeLike(input)}%`)` only matches literally.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
