import type { MessageSchema } from "@/core/i18n/generated/messages";

/** Dotted paths to every message, e.g. `"common.actions.save"`. A typo is a compile error. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<MessageSchema>;

export type { MessageSchema };
