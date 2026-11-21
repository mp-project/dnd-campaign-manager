import { SpanStatusCode, type Span } from "@opentelemetry/api";

type InstrumentedRequest = {
  /** Added by @fastify/otel when telemetry runs; missing otherwise (tests, no endpoint). */
  opentelemetry?: () => { span?: Span | null };
};

/**
 * Sets the outcome on the request's span the way the logs see it: an expected error (4xx) is no
 * failure of the API, so it does not count in error rates; a 5xx records the exception. The
 * Fastify instrumentation marks every thrown error as failed before the error handler runs, and
 * an OK status overrides that.
 */
export function markRequestSpan(request: unknown, error: unknown, statusCode: number): void {
  const span = (request as InstrumentedRequest).opentelemetry?.().span;

  if (!span) {
    return;
  }

  if (statusCode < 500) {
    span.setStatus({ code: SpanStatusCode.OK });
    return;
  }

  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({ code: SpanStatusCode.ERROR });
}
