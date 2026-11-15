import type { IconName } from "@/components/base/iconNames";
import type { BadgeTone } from "@/components/base/types";

/**
 * Who sees content, the one mapping for lists, editors and settings: icon, text color and badge
 * tone. Labels are `common.visibility.<value>.label|short|hint`. `private` exists for notes only.
 * i18n-dynamic: common.visibility.*
 */
export type Visibility = "private" | "gm" | "selected" | "all";

export const VISIBILITY: Record<Visibility, { icon: IconName; textClass: string; tone: BadgeTone }> = {
  private: { icon: "ui-eye-off", textClass: "text-ink", tone: "neutral" },
  all: { icon: "ui-globe", textClass: "text-ok", tone: "ok" },
  selected: { icon: "ui-users", textClass: "text-ink", tone: "info" },
  gm: { icon: "ui-lock", textClass: "text-ink", tone: "warn" },
};
