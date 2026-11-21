import { Writable } from "node:stream";

import {
  logs,
  SeverityNumber,
  SpanStatusCode,
  trace,
  type Logger,
  type LogRecord,
  type Span,
} from "@opentelemetry/api";

import { createLogger, loggerSettingsFromEnv } from "#core/log/logger";
import { createOtelLogStream, toOtelLogRecord } from "#core/log/otelLogStream";
import {
  isTelemetryStarted,
  markTelemetryStarted,
  shutdownTelemetry,
} from "#core/telemetry/lifecycle";
import { markRequestSpan } from "#core/telemetry/requestSpan";
import {
  incomingSpanAttributes,
  isProbe,
  pathWithoutQuery,
  redactQuery,
} from "#core/telemetry/spanAttributes";
import { createTestEnv } from "#test/helpers/testEnv";

function captureLines() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });

  return { lines, stream };
}

function fakeOtelLogger() {
  const records: LogRecord[] = [];
  const logger = { emit: (record: LogRecord) => records.push(record), enabled: () => true } as Logger;

  return { logger, records };
}

describe("OpenTelemetry log records", () => {
  it("keeps the whole line as body and copies ids and codes as attributes", () => {
    const line = `${JSON.stringify({
      level: 50,
      time: 1_700_000_000_000,
      msg: "request",
      requestId: "req-1",
      userId: "user-1",
      statusCode: 500,
      errorCode: "INTERNAL_ERROR",
      entities: [{ id: "x" }],
      err: { message: "boom" },
    })}\n`;

    const record = toOtelLogRecord(line);

    expect(record.severityNumber).toBe(SeverityNumber.ERROR);
    expect(record.severityText).toBe("ERROR");
    expect(record.timestamp).toBe(1_700_000_000_000);
    expect(record.body).toBe(line.trimEnd());
    expect(record.attributes).toEqual({
      msg: "request",
      requestId: "req-1",
      userId: "user-1",
      statusCode: 500,
      errorCode: "INTERNAL_ERROR",
    });
  });

  it("leaves the values of a change out of the export", () => {
    const line = JSON.stringify({
      level: 30,
      time: 1,
      msg: "change",
      kind: "change",
      action: "notes.update",
      entities: [{ entityType: "note", entityId: "n-1", fields: ["content"], values: { content: "Geheim" } }],
    });

    const record = toOtelLogRecord(line);

    expect(String(record.body)).not.toContain("Geheim");
    expect(JSON.parse(String(record.body))).toMatchObject({
      action: "notes.update",
      entities: [{ entityType: "note", entityId: "n-1", fields: ["content"] }],
    });
  });

  it("maps every pino level", () => {
    const severities = [10, 20, 30, 40, 50, 60].map(
      (level) => toOtelLogRecord(JSON.stringify({ level, time: 1, msg: "x" })).severityNumber,
    );

    expect(severities).toEqual([
      SeverityNumber.TRACE,
      SeverityNumber.DEBUG,
      SeverityNumber.INFO,
      SeverityNumber.WARN,
      SeverityNumber.ERROR,
      SeverityNumber.FATAL,
    ]);
  });

  it("hands every line to the OpenTelemetry logger", () => {
    const { logger, records } = fakeOtelLogger();

    createOtelLogStream(logger).write(`${JSON.stringify({ level: 30, time: 1, msg: "hello" })}\n`);

    expect(records).toHaveLength(1);
    expect(records[0]?.attributes).toEqual({ msg: "hello" });
  });
});

describe("logger with export", () => {
  const settings = { service: "api", pretty: false, environment: "test" } as const;

  afterEach(() => {
    logs.disable();
  });

  it("exports from its own level while stdout keeps LOG_LEVEL", () => {
    const { logger, records } = fakeOtelLogger();
    logs.setGlobalLoggerProvider({ getLogger: () => logger });

    const appLogger = createLogger({ ...settings, level: "silent", exportLevel: "debug" });
    appLogger.trace("not exported");
    appLogger.debug({ requestId: "req-2", password: "hunter2" }, "exported");

    expect(appLogger.level).toBe("debug");
    expect(records).toHaveLength(1);
    expect(records[0]?.attributes).toMatchObject({ msg: "exported", requestId: "req-2" });
    // Redaction happens before the line is written, so the export never sees the value.
    expect(String(records[0]?.body)).not.toContain("hunter2");
  });

  it("keeps stdout at its own level when the export wants more", () => {
    const { logger, records } = fakeOtelLogger();
    logs.setGlobalLoggerProvider({ getLogger: () => logger });
    const { lines, stream } = captureLines();

    const appLogger = createLogger({ ...settings, level: "info", exportLevel: "trace" }, stream);
    appLogger.trace("trace line");
    appLogger.debug("debug line");
    appLogger.info("info line");

    expect(lines.map((line) => line.msg)).toEqual(["info line"]);
    expect(records.map((record) => record.attributes?.msg)).toEqual(["trace line", "debug line", "info line"]);
  });

  it("does not export without an export level", () => {
    const appLogger = createLogger({ ...settings, level: "warn", exportLevel: null });

    expect(appLogger.level).toBe("warn");
  });

  it("exports only once the SDK was started", async () => {
    const env = createTestEnv({ LOG_EXPORT_LEVEL: "debug" });

    expect(loggerSettingsFromEnv(env, "api").exportLevel).toBeNull();

    markTelemetryStarted({ shutdown: async () => {} });
    expect(loggerSettingsFromEnv(env, "api").exportLevel).toBe("debug");

    await shutdownTelemetry();
    expect(loggerSettingsFromEnv(env, "api").exportLevel).toBeNull();
  });

  it("writes the active trace into every line", () => {
    const { lines, stream } = captureLines();
    const spy = jest.spyOn(trace, "getActiveSpan").mockReturnValue({
      spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
    } as Span);

    createLogger({ ...settings, level: "info" }, stream).info("traced");
    spy.mockRestore();

    expect(lines[0]).toMatchObject({ trace_id: "a".repeat(32), span_id: "b".repeat(16) });
  });
});

describe("span attributes", () => {
  it("keeps parameter names and drops every value", () => {
    expect(redactQuery("/api/v1/auth/verify-email?email=a%40b.de&code=123456")).toBe(
      "email=[redacted]&code=[redacted]",
    );
    expect(redactQuery("/api/v1/campaigns")).toBeUndefined();
  });

  it("drops parts without a name, which may be a value themselves", () => {
    expect(redactQuery("/api/v1/x?a@b.de&page=2")).toBe("[redacted]&page=[redacted]");
  });

  it("replaces addresses and the query of an incoming request", () => {
    expect(incomingSpanAttributes("/api/v1/auth/oauth/callback?code=x&state=y")).toEqual({
      "client.address": "[redacted]",
      "network.peer.address": "[redacted]",
      "network.peer.port": 0,
      "url.query": "code=[redacted]&state=[redacted]",
    });
    expect(incomingSpanAttributes("/api/v1/me")).not.toHaveProperty("url.query");
  });

  it("knows the probes and strips the query from paths", () => {
    expect(isProbe("/health")).toBe(true);
    expect(isProbe("/ready?x=1")).toBe(true);
    expect(isProbe("/api/v1/me")).toBe(false);
    expect(pathWithoutQuery("/api/v1/auth/verify-email?code=1")).toBe("/api/v1/auth/verify-email");
  });
});

describe("request span outcome", () => {
  function requestWithSpan() {
    const span = { setStatus: jest.fn(), recordException: jest.fn() };

    return { span, request: { opentelemetry: () => ({ span: span as unknown as Span }) } };
  }

  it("does not count an expected error as a failure", () => {
    const { span, request } = requestWithSpan();

    markRequestSpan(request, new Error("Not found"), 404);

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.recordException).not.toHaveBeenCalled();
  });

  it("records the exception of a 5xx", () => {
    const { span, request } = requestWithSpan();
    const error = new Error("boom");

    markRequestSpan(request, error, 500);

    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
  });

  it("does nothing without telemetry", () => {
    expect(() => markRequestSpan({}, new Error("x"), 500)).not.toThrow();
  });
});

describe("telemetry shutdown", () => {
  it("flushes once and forgets the SDK", async () => {
    const shutdown = jest.fn(async () => {});
    markTelemetryStarted({ shutdown });

    expect(isTelemetryStarted()).toBe(true);
    await expect(shutdownTelemetry()).resolves.toBe(true);
    await expect(shutdownTelemetry()).resolves.toBe(true);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(isTelemetryStarted()).toBe(false);
  });

  it("lets a second caller wait for the flush that is running", async () => {
    let finish: () => void = () => {};
    markTelemetryStarted({ shutdown: () => new Promise<void>((resolve) => (finish = resolve)) });

    let secondDone = false;
    const first = shutdownTelemetry();
    const second = shutdownTelemetry().then((result) => {
      secondDone = true;
      return result;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(secondDone).toBe(false);

    finish();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("gives up when the collector does not answer in time", async () => {
    markTelemetryStarted({ shutdown: () => new Promise(() => {}) });

    await expect(shutdownTelemetry(20)).resolves.toBe(false);
  });
});

describe("Sentry", () => {
  it("turns a pino line into a Sentry log without change values", async () => {
    const { toSentryLog } = await import("#core/log/sentryLogStream");
    const log = toSentryLog(
      JSON.stringify({
        level: 40,
        time: 1,
        msg: "change",
        requestId: "req-1",
        statusCode: 409,
        entities: [{ entityType: "note", entityId: "n-1", values: { content: "Geheim" } }],
      }),
    );

    expect(log.level).toBe("warn");
    expect(log.message).toBe("change");
    expect(log.attributes).toMatchObject({ requestId: "req-1", statusCode: 409 });
    expect(String(log.attributes.entities)).not.toContain("Geheim");
    expect(log.attributes).not.toHaveProperty("time");
  });

  it("keeps no query, cookies, bodies or personal data in an event", async () => {
    const { scrubEvent } = await import("#core/telemetry/sentry");
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://api.example.de/api/v1/auth/verify-email?email=a%40b.de&code=1",
        method: "GET",
        query_string: "email=a%40b.de&code=1",
        cookies: { session: "x" },
        data: { password: "hunter2" },
        headers: { "user-agent": "Firefox", cookie: "session=x", authorization: "Bearer x" },
      },
      user: { id: "u-1", email: "a@b.de", ip_address: "1.2.3.4" },
    });

    expect(event.request).toEqual({
      url: "https://api.example.de/api/v1/auth/verify-email",
      method: "GET",
      headers: { "user-agent": "Firefox" },
    });
    expect(event.user).toEqual({ id: "u-1" });
  });

  it("sends log lines to Sentry from its own level", async () => {
    const { createSentryLogStream } = await import("#core/log/sentryLogStream");
    const target = { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };
    const stream = createSentryLogStream(target as never);

    stream.write(`${JSON.stringify({ level: 50, time: 1, msg: "boom", task: "media.variants" })}\n`);

    expect(target.error).toHaveBeenCalledWith("boom", { task: "media.variants" });
  });
});

describe("errors without the values they carry", () => {
  async function drizzleError() {
    const { DrizzleQueryError } = await import("drizzle-orm/errors");
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
      code: "23505",
      severity: "ERROR",
      constraint: "users_email_key",
      table: "users",
      detail: "Key (email)=(geheim@example.de) already exists.",
    });
    return new DrizzleQueryError('insert into "users" ("email", "password_hash") values ($1, $2)', ["geheim@example.de", "$argon2id$hash"], pgError);
  }

  it("keeps the SQL and codes of a failed query but no parameter values", async () => {
    const { safeError } = await import("#core/log/safeError");
    const { InternalError } = await import("#core/error/http/index");

    const safe = safeError(new InternalError("Internal server error", null, { cause: await drizzleError() }));
    const text = JSON.stringify(safe, Object.getOwnPropertyNames(safe)) + String((safe as Error).stack);
    const cause = (safe as Error).cause as Error & Record<string, unknown>;
    const pg = cause.cause as Error & Record<string, unknown>;

    expect(cause.message).toBe('Failed query: insert into "users" ("email", "password_hash") values ($1, $2)');
    expect(cause).not.toHaveProperty("params");
    expect(pg).toMatchObject({ code: "23505", constraint: "users_email_key", table: "users" });
    expect(pg).not.toHaveProperty("detail");
    for (const leaked of [text, String(cause.stack), String(pg.stack), pg.message]) {
      expect(leaked).not.toContain("geheim@example.de");
      expect(leaked).not.toContain("argon2id");
    }
  });

  it("writes log lines without them", async () => {
    const { lines, stream } = captureLines();

    createLogger({ service: "api", pretty: false, environment: "test", level: "info" }, stream).error(
      { err: await drizzleError() },
      "Request failed",
    );

    expect(JSON.stringify(lines[0])).not.toContain("geheim@example.de");
    expect(JSON.stringify(lines[0])).toContain("23505");
  });

  it("drops recipients and answers of mail errors", async () => {
    const { safeError } = await import("#core/log/safeError");
    const smtp = Object.assign(new Error("Can't send mail - all recipients were rejected: 550 <geheim@example.de>"), {
      code: "EENVELOPE",
      responseCode: 550,
      command: "RCPT TO",
      rejected: ["geheim@example.de"],
      response: "550 <geheim@example.de> unknown",
    });

    const safe = safeError(smtp) as Error & Record<string, unknown>;

    expect(safe).toMatchObject({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" });
    expect(JSON.stringify(safe, Object.getOwnPropertyNames(safe))).not.toContain("geheim@example.de");
  });
});
