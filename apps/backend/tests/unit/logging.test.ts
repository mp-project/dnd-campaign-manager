import { randomUUID } from "node:crypto";

import type { AppModule } from "#core/app/moduleSystem";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import { auditHistoryEvents, auditLog } from "#core/log/auditLog";
import { runWithLogContext } from "#core/log/logContext";
import type { ErrorReporter } from "#core/log/errorReporter";
import { requestLogLevel } from "#core/log/requestLog";
import { reportError } from "#core/log/reportError";
import { buildTestApp } from "#test/helpers/buildTestApp";
import { captureLogs, LOG_LEVEL_VALUES } from "#test/helpers/logCapture";

const loggingModule: AppModule = {
  name: "logging-tests",
  dependencies: [],
  register: async (app) => {
    app.get("/logging/ok", { config: { public: "test probe" } }, async (request) => {
      request.log.info({ step: "inside" }, "handler line");

      return { ok: true };
    });
    app.get("/logging/missing/:id", { config: { public: "test probe" } }, async () => {
      throw new NotFoundError("Nothing here");
    });
    app.get("/logging/conflict", { config: { public: "test probe" } }, async () => {
      throw new ConflictError("Taken", null, { cause: new Error("unique violation") });
    });
    app.get("/logging/broken", { config: { public: "test probe" } }, async () => {
      throw new Error("Sensitive stack details", { cause: new Error("root cause") });
    });
  },
};

function createReporter() {
  const capture = jest.fn<void, Parameters<ErrorReporter["capture"]>>();
  const reporter: ErrorReporter = { capture, flush: async () => true };

  return { capture, reporter };
}

function buildLoggingApp(nodeEnv: "test" | "production" = "test") {
  const logs = captureLogs();
  const { capture, reporter } = createReporter();
  const session = buildTestApp({
    env: { NODE_ENV: nodeEnv },
    modules: [loggingModule],
    publicPorts: { errorReporter: reporter },
    logger: logs.logger,
  });

  return { ...session, logs, capture };
}

const ACTOR = { actorId: randomUUID(), systemRole: "USER" as const };

describe("request log", () => {
  it("writes exactly one request line per request with route pattern, status and actor", async () => {
    const { app, injectAs, logs } = buildLoggingApp();

    await app.ready();
    const response = await injectAs(ACTOR, { method: "GET", url: "/api/v1/logging/ok?secret=1" });

    expect(response.statusCode).toBe(200);

    const requests = logs.find("request");

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "request",
      level: LOG_LEVEL_VALUES.info,
      method: "GET",
      route: "/api/v1/logging/ok",
      url: "/api/v1/logging/ok",
      statusCode: 200,
      userId: ACTOR.actorId,
      systemRole: "USER",
    });
    expect(typeof requests[0]?.requestId).toBe("string");
    expect(typeof requests[0]?.durationMs).toBe("number");
    expect(requests[0]?.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(requests[0])).not.toContain("authorization");

    // Lines written inside the handler carry the same request id and the actor.
    expect(logs.find("handler line")[0]).toMatchObject({
      requestId: requests[0]?.requestId,
      userId: ACTOR.actorId,
      step: "inside",
    });

    await app.close();
  });

  it("logs expected errors only through the request line and reports nothing", async () => {
    const { app, logs, capture } = buildLoggingApp();

    await app.ready();
    await app.inject({ method: "GET", url: `/api/v1/logging/missing/${randomUUID()}` });
    await app.inject({ method: "GET", url: "/api/v1/logging/conflict" });
    await app.inject({ method: "GET", url: "/api/v1/unknown-route" });

    expect(logs.find("request").map((line) => [line.route, line.statusCode, line.errorCode])).toEqual([
      ["/api/v1/logging/missing/:id", 404, "NOT_FOUND"],
      ["/api/v1/logging/conflict", 409, "CONFLICT"],
      [null, 404, "NOT_FOUND"],
    ]);
    expect(logs.lines().filter((line) => line.level >= LOG_LEVEL_VALUES.warn)).toEqual([]);
    expect(capture).not.toHaveBeenCalled();

    await app.close();
  });

  it("reports unexpected errors with their cause and still masks them in production", async () => {
    const { app, logs, capture } = buildLoggingApp("production");

    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/logging/broken" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR", message: "Internal server error", details: null },
    });
    expect(response.body).not.toContain("Sensitive");

    const [failure] = logs.find("Request failed");

    expect(failure).toMatchObject({
      level: LOG_LEVEL_VALUES.error,
      route: "/api/v1/logging/broken",
      errorCode: "INTERNAL_ERROR",
      err: { message: expect.stringContaining("Sensitive stack details") },
    });
    expect(JSON.stringify(failure?.err)).toContain("root cause");
    expect(logs.find("request")[0]).toMatchObject({ statusCode: 500, level: LOG_LEVEL_VALUES.error });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({
      route: "/api/v1/logging/broken",
      errorCode: "INTERNAL_ERROR",
    });

    await app.close();
  });

  it("chooses the level by status and keeps probes quiet", () => {
    expect(requestLogLevel(200, "/api/v1/notes")).toBe("info");
    expect(requestLogLevel(404, "/api/v1/notes")).toBe("info");
    expect(requestLogLevel(412, "/api/v1/notes")).toBe("info");
    expect(requestLogLevel(400, "/api/v1/notes")).toBe("warn");
    expect(requestLogLevel(429, "/api/v1/notes")).toBe("warn");
    expect(requestLogLevel(500, "/api/v1/notes")).toBe("error");
    expect(requestLogLevel(200, "/health")).toBe("debug");
    expect(requestLogLevel(503, "/ready")).toBe("warn");
  });
});

describe("logger", () => {
  it("never writes credentials", () => {
    const logs = captureLogs();

    logs.logger.info(
      {
        req: { headers: { authorization: "Bearer abc", cookie: "access_token=abc" } },
        body: { password: "hunter2", refreshToken: "r", verificationCode: "123456" },
        secret: "s",
      },
      "sensitive",
    );

    const line = JSON.stringify(logs.find("sensitive")[0]);

    for (const value of ["Bearer abc", "access_token=abc", "hunter2", '"r"', "123456", '"s"']) {
      expect(line).not.toContain(value);
    }
  });

  it("keeps error codes readable", () => {
    const logs = captureLogs();

    logs.logger.warn({ err: new ConflictError("Taken") }, "conflict");

    expect(logs.find("conflict")[0]).toMatchObject({ err: { code: "CONFLICT", statusCode: 409 } });
  });
});

describe("reportError", () => {
  it("logs with stack and passes the context to the reporter", () => {
    const logs = captureLogs();
    const { capture, reporter } = createReporter();
    const error = new Error("worker failed");

    reportError(logs.logger, error, "Job failed", { task: "media.variants", mediaId: "m" }, reporter);

    expect(logs.find("Job failed")[0]).toMatchObject({
      level: LOG_LEVEL_VALUES.error,
      task: "media.variants",
      mediaId: "m",
      err: { message: "worker failed", stack: expect.any(String) },
    });
    expect(capture).toHaveBeenCalledWith(error, { task: "media.variants", mediaId: "m" });
  });

  it("logs fatal errors as fatal", () => {
    const logs = captureLogs();
    const { reporter } = createReporter();

    reportError(logs.logger, new Error("gone"), "Process failed", { fatal: true }, reporter);

    expect(logs.find("Process failed")[0]?.level).toBe(LOG_LEVEL_VALUES.fatal);
  });
});

describe("audit log", () => {
  const event = {
    eventId: "e1",
    actionId: "a1",
    action: "campaignMembers.updateRole",
    entityType: "campaignMembership",
    entityId: "m1",
    entityVersion: 3,
    campaignId: "c1",
    actorId: "u1",
    fields: ["role"],
  };

  it("writes one change line per action with field names and marks rights changes", () => {
    const logs = captureLogs();

    auditHistoryEvents(logs.logger, [
      event,
      { ...event, eventId: "e2", entityType: "tag", entityId: "t1", fields: ["name"] },
      { ...event, eventId: "e3", actionId: "a2", action: "notes.update", entityType: "note", fields: ["content"] },
    ]);

    const changes = logs.find("change");

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      kind: "change",
      action: "campaignMembers.updateRole",
      campaignId: "c1",
      actorId: "u1",
      security: true,
      entities: [
        { entityType: "campaignMembership", entityId: "m1", version: 3, fields: ["role"] },
        { entityType: "tag", entityId: "t1", version: 3, fields: ["name"] },
      ],
    });
    expect(changes[1]).not.toHaveProperty("security");
  });

  it("adds the new values only while the request asks for them", () => {
    const logs = captureLogs();
    const values = new Map([["e1", { role: "EDITOR" }]]);

    runWithLogContext({ changeValues: true }, () => auditHistoryEvents(logs.logger, [event], values));
    runWithLogContext({ changeValues: false }, () => auditHistoryEvents(logs.logger, [event], values));
    auditHistoryEvents(logs.logger, [event], values);

    const [on, off, outside] = logs.find("change");

    expect(on?.entities).toEqual([
      expect.objectContaining({ fields: ["role"], values: { role: "EDITOR" } }),
    ]);
    expect(off?.entities).toEqual([expect.not.objectContaining({ values: expect.anything() })]);
    expect(outside?.entities).toEqual([expect.not.objectContaining({ values: expect.anything() })]);
    expect(JSON.stringify(on)).not.toContain("changeValues");
  });

  it("names the reason of a public action", () => {
    const logs = captureLogs();

    auditLog(logs.logger, {
      action: "auth.register",
      entities: [{ entityType: "user", entityId: "u2" }],
      public: "registration",
    });

    expect(logs.find("change")[0]).toMatchObject({ public: "registration" });
  });
});
