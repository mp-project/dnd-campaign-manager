import { useAppI18n } from "@/core/i18n";

/**
 * Browser and system named from a user agent, for the lists of sessions and devices. Product names
 * are no translations; the sentence around them comes from the messages. Unknown parts stay null.
 */
/** In order: Edge, Opera, Firefox and Chrome also name Safari or Chrome in their agents (iOS: EdgiOS, FxiOS, CriOS). */
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\/|EdgA\/|EdgiOS\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(userAgent: string | null): { browser: string | null; system: string | null } {
  const ua = userAgent ?? "";
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    system: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
  };
}

/** "Firefox auf macOS", or "Unbekanntes Gerät" when nothing is recognised. */
export function useDeviceName() {
  const { t } = useAppI18n();

  return function deviceName(userAgent: string | null): string {
    const { browser, system } = describeUserAgent(userAgent);
    if (!browser && !system) return t("users.device.unknown");
    return t("users.device.describe", {
      browser: browser ?? t("users.device.browser"),
      system: system ?? t("users.device.system"),
    });
  };
}
