/**
 * Pseudo language `qps`: German messages with accented letters, about 40 % longer and in brackets.
 * Text that stays plain on screen is hard-coded, text that breaks the layout is too tight for long
 * words. Placeholders (`{count}`), plural pipes and linked messages (`@:key`) stay untouched.
 */

export const PSEUDO_LOCALE = "qps";

const ACCENTED: Record<string, string> = {
  a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú",
  c: "ç", n: "ñ", s: "š", y: "ý", z: "ž", C: "Ç", N: "Ñ", S: "Š", Y: "Ý", Z: "Ž",
};

const PROTECTED = /(\{[^}]*\}|@:[\w.]+|\s*\|\s*)/;

function pseudoText(text: string): string {
  const accented = [...text].map((char) => ACCENTED[char] ?? char).join("");
  const padding = "~".repeat(Math.ceil(text.length * 0.4));
  return accented.trim() ? `${accented}${padding}` : accented;
}

export function pseudoLocalizeMessage(message: string): string {
  const parts = message.split(PROTECTED).map((part) => (PROTECTED.test(part) ? part : pseudoText(part)));
  // Each plural form gets its own brackets, so the pipes stay where vue-i18n expects them.
  return parts
    .join("")
    .split(/\s*\|\s*/)
    .map((form) => `[${form}]`)
    .join(" | ");
}

export type MessageTree = { [key: string]: string | MessageTree };

export function pseudoLocalize(messages: MessageTree): MessageTree {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === "string" ? pseudoLocalizeMessage(value) : pseudoLocalize(value),
    ]),
  );
}
