import { register } from "node:module";

import FastifyOtel from "@fastify/otel";
import { diag, DiagLogLevel, type DiagLogFunction } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { startNodeSdk } from "@opentelemetry/sdk-node";
import { createAddHookMessageChannel } from "import-in-the-middle";

import type { AppLogger } from "#core/log/logger";
import { markTelemetryStarted } from "#core/telemetry/lifecycle";
import { incomingSpanAttributes, isProbe, pathWithoutQuery } from "#core/telemetry/spanAttributes";

export type TelemetrySettings = {
  /** `service.name` in Grafana, e.g. `questaria-api`. */
  serviceName: string;
  /** `deployment.environment.name`: development, stage, production. */
  environment: string;
  /**
   * Gets the SDK's own diagnostics (a refused token, an unreachable endpoint). Must write to
   * stdout only: through the export it would report export failures into the failing export.
   */
  diagnostics: AppLogger;
};

function diagnosticsTo(logger: AppLogger, level: "error" | "warn" | "info" | "debug"): DiagLogFunction {
  return (message, ...args) => {
    logger[level]({ details: args.map((arg) => String(arg).slice(0, 500)) }, `OpenTelemetry: ${message}`);
  };
}

/**
 * Starts OpenTelemetry for this process: traces of incoming requests (Fastify routes as span
 * names), PostgreSQL queries (statement text only, no parameter values) and outgoing HTTP (S3),
 * metrics of HTTP, the database pool and the Node runtime, and the log records the logger hands
 * over (`otelLogStream`). Exporters, endpoint, headers and sampling come from the standard
 * `OTEL_*` variables (OTLP over http/protobuf by default).
 *
 * Must run before the app is imported (`node --import ./dist/instrumentation.js …`), because
 * the instrumentations hook into module loading.
 */
export async function startTelemetry(settings: TelemetrySettings): Promise<void> {
  // ESM: only modules an instrumentation asks for are wrapped, everything else loads untouched.
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register("import-in-the-middle/hook.mjs", import.meta.url, registerOptions);

  const sdk = startNodeSdk({
    // The SDK's own diagnostics (exporter failures) go to stderr; warnings are enough.
    logLevel: process.env.OTEL_LOG_LEVEL ?? "warn",
    resourceAttributes: {
      "service.name": settings.serviceName,
      "service.namespace": "questaria",
      "deployment.environment.name": settings.environment,
    },
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => isProbe(request.url),
        startIncomingSpanHook: (request) => incomingSpanAttributes(request.url),
      }),
      new FastifyOtel.FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: ({ url }) => isProbe(url),
        // One span per request with its route: hook and handler spans are named after the
        // plugin's source text and add a dozen spans per request without telling more.
        instrumentHooks: false,
        instrumentHandler: false,
        // The plugin puts the raw URL, query included, into `url.path`.
        requestHook: (span, request) => {
          span.setAttribute("url.path", pathWithoutQuery(request.url));
        },
        // It would record every thrown error, 404 and 409 included; the error handler records
        // only 5xx (`markRequestSpan`).
        recordExceptions: false,
      }),
      // Without a request or job around it, a query is the media worker polling every few seconds.
      new PgInstrumentation({ requireParentSpan: true }),
      new RuntimeNodeInstrumentation(),
    ],
  });

  await waitForAllMessagesAcknowledged();

  // Replaces the console logger the SDK installs, so its diagnostics are JSON lines like the rest.
  const level = DiagLogLevel[(process.env.OTEL_LOG_LEVEL ?? "warn").toUpperCase() as keyof typeof DiagLogLevel];
  diag.setLogger(
    {
      error: diagnosticsTo(settings.diagnostics, "error"),
      warn: diagnosticsTo(settings.diagnostics, "warn"),
      info: diagnosticsTo(settings.diagnostics, "info"),
      debug: diagnosticsTo(settings.diagnostics, "debug"),
      verbose: diagnosticsTo(settings.diagnostics, "debug"),
    },
    { logLevel: level ?? DiagLogLevel.WARN, suppressOverrideMessage: true },
  );

  markTelemetryStarted(sdk);
}
