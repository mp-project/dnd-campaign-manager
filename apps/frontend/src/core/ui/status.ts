import type { BadgeTone } from "@/components/base/types";
import type { IconName } from "@/components/base/iconNames";

/**
 * The one mapping of status codes to badge tone and icon: the same meaning gets the same tone
 * everywhere. Labels are `common.status.<CODE>` in the message files.
 * i18n-dynamic: common.status.*
 */
const STATUS = {
  // done / active
  ACTIVE: { tone: "ok", icon: "ui-check" },
  PUBLISHED: { tone: "ok", icon: "ui-check" },
  RELEASED: { tone: "ok", icon: "ui-check" },
  VERIFIED: { tone: "ok", icon: "ui-shield" },
  CONFIRMED: { tone: "ok", icon: "ui-check" },
  CONNECTED: { tone: "ok", icon: "ui-check" },
  DEFEATED: { tone: "ok", icon: "ui-check" },
  // planned / in progress
  PLANNED: { tone: "info", icon: "ui-calendar" },
  IN_PROGRESS: { tone: "info", icon: "aktion-bearbeiten" },
  IN_PREPARATION: { tone: "info", icon: "aktion-bearbeiten" },
  // waiting for something
  PENDING: { tone: "warn", icon: "ui-hourglass" },
  IN_REVIEW: { tone: "warn", icon: "ui-hourglass" },
  UNVERIFIED: { tone: "warn", icon: "ui-shield" },
  INVITED: { tone: "warn", icon: "ui-mail" },
  // neutral
  DRAFT: { tone: "neutral", icon: "ui-file" },
  OPEN: { tone: "neutral", icon: "ui-flag" },
  COMPLETED: { tone: "neutral", icon: "ui-check-circle" },
  DISCARDED: { tone: "neutral", icon: "aktion-schliessen" },
  DISCOVERED: { tone: "neutral", icon: "ui-eye" },
  ARCHIVED: { tone: "neutral", icon: "ui-database" },
  // problems
  BLOCKED: { tone: "danger", icon: "aktion-gesperrt" },
  REJECTED: { tone: "danger", icon: "aktion-schliessen" },
  FAILED: { tone: "danger", icon: "ui-alert" },
  ERROR: { tone: "danger", icon: "ui-alert" },
} as const satisfies Record<string, { tone: BadgeTone; icon: IconName }>;

export type StatusCode = keyof typeof STATUS;

export const STATUS_CODES = Object.keys(STATUS) as StatusCode[];

export type StatusDefinition =
  | { known: true; tone: BadgeTone; icon: IconName; labelKey: `common.status.${StatusCode}` }
  | { known: false; tone: BadgeTone; icon: undefined; labelKey: undefined };

export function isStatusCode(value: string): value is StatusCode {
  return Object.hasOwn(STATUS, value);
}

/** An unknown status (new backend value, typo) is shown neutral with its code, never an error. */
export function statusDefinition(status: string): StatusDefinition {
  if (!isStatusCode(status)) return { known: false, tone: "neutral", icon: undefined, labelKey: undefined };
  return { known: true, ...STATUS[status], labelKey: `common.status.${status}` };
}
