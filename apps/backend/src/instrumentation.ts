/**
 * Loaded with `--import` before the API or the media worker: starts OpenTelemetry when an OTLP
 * endpoint is configured (Grafana Cloud), and does nothing otherwise (locally, tests, CI).
 * `OTEL_SERVICE_NAME` tells the processes apart; the start commands set it.
 */
import { getEnv } from "#core/env";

const env = getEnv();

if (env.OTEL_EXPORTER_OTLP_ENDPOINT && !env.OTEL_SDK_DISABLED) {
  // Imported only when needed: without an endpoint the SDK is not even loaded.
  const { startTelemetry } = await import("#core/telemetry/sdk");
  const { createLogger, loggerSettingsFromEnv } = await import("#core/log/logger");
  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "questaria-api";

  await startTelemetry({
    serviceName,
    environment: env.NODE_ENV,
    // stdout only (no export yet at this point, and never for the SDK's own diagnostics).
    diagnostics: createLogger(loggerSettingsFromEnv(env, `${serviceName}-telemetry`)),
  });
}
