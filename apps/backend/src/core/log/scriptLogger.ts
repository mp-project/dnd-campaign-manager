import { getEnv } from "#core/env";
import { createLogger, loggerSettingsFromEnv, type AppLogger } from "#core/log/logger";

/** Logger of a command line script (`seed`, `media:cleanup` …), set up like the API's. */
export function createScriptLogger(service: string): AppLogger {
  return createLogger(loggerSettingsFromEnv(getEnv(), service));
}
