/** Shared prop types of the base components. */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger" | "dark" | "outline-gold";

/** lg 44 px (default touch target), md 40 px, sm 36 px, xs 32 px. */
export type ButtonSize = "lg" | "md" | "sm" | "xs";

export type BadgeTone =
  | "gold"
  | "green"
  | "blue"
  | "violet"
  | "rose"
  | "sand"
  | "neutral"
  | "burgundy"
  | "ok"
  | "warn"
  | "danger"
  | "info"
  | "outline";

export type AvatarTone = "teal" | "gold" | "blue" | "brown" | "violet" | "burgundy";

/** Options of selects and segmented controls. */
export type Option<T extends string | number = string> = { value: T; label: string; disabled?: boolean };
