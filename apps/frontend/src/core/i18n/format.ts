import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { timeZone } from "@/core/i18n/settings";

const DATE_STYLES = {
  date: { dateStyle: "medium" },
  dateLong: { dateStyle: "long" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** Dates and numbers in the active language and the user's time zone. Never format by hand. */
export function useFormat() {
  const { locale } = useI18n();
  // The pseudo language formats like the reference language.
  const intlLocale = computed(() => (locale.value === "qps" ? "de" : locale.value));

  /** An invalid date shows nothing; an unknown time zone falls back to the browser's. */
  function date(value: Date | string | number, style: DateStyle = "date"): string {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(intlLocale.value, { ...DATE_STYLES[style], timeZone: timeZone.value }).format(
        instant,
      );
    } catch {
      return new Intl.DateTimeFormat(intlLocale.value, DATE_STYLES[style]).format(instant);
    }
  }

  function number(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(intlLocale.value, options).format(value);
  }

  function relative(value: Date | string | number, now: Date = new Date()): string {
    if (Number.isNaN(new Date(value).getTime())) return "";
    const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 31_536_000],
      ["month", 2_592_000],
      ["week", 604_800],
      ["day", 86_400],
      ["hour", 3_600],
      ["minute", 60],
    ];
    const format = new Intl.RelativeTimeFormat(intlLocale.value, { numeric: "auto" });
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return format.format(seconds, "second");
  }

  return { date, number, relative };
}
