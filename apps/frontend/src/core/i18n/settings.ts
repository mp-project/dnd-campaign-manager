import { ref } from "vue";

/**
 * Display settings of the current user that formatting depends on. The profile sets them after
 * sign-in (`users.timezone`); before that the browser's time zone applies.
 */
export const timeZone = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

/** Ignores names the browser doesn't know (an old or mistyped zone must not break dates). */
export function setTimeZone(value: string | null | undefined): void {
  if (!value) return;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    timeZone.value = value;
  } catch {
    // keep the current zone
  }
}
