import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/core/api/errors";
import { handleRouterError, isChunkLoadError } from "@/core/log/errorHandlers";
import { addLogSink, type LogEntry } from "@/core/log/logger";
import { addErrorReporter, classifyError, reportError } from "@/core/log/reportError";

const apiError = (status: number, code: ConstructorParameters<typeof ApiError>[0]["code"]) =>
  new ApiError({ status, code, message: "server text", requestId: "req-7" });

describe("classifyError", () => {
  it("treats translated API answers as expected", () => {
    for (const [status, code] of [
      [400, "VALIDATION_ERROR"],
      [401, "UNAUTHENTICATED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [412, "VERSION_CONFLICT"],
      [413, "MAX_UPLOAD_SIZE_EXCEEDED"],
      [429, "RATE_LIMITED"],
    ] as const) {
      expect(classifyError(apiError(status, code))).toBe("expected");
    }
  });

  it("separates network errors from unexpected ones", () => {
    expect(classifyError(apiError(0, "NETWORK_ERROR"))).toBe("network");
    expect(classifyError(apiError(500, "INTERNAL_ERROR"))).toBe("unexpected");
    expect(classifyError(apiError(503, "SERVICE_UNAVAILABLE"))).toBe("unexpected");
    expect(classifyError(apiError(400, "UNKNOWN_ERROR"))).toBe("unexpected");
    expect(classifyError(new TypeError("x is undefined"))).toBe("unexpected");
  });
});

describe("reportError", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  function listen() {
    const entries: LogEntry[] = [];
    const reported: unknown[] = [];
    cleanups.push(addLogSink((entry) => entries.push(entry)));
    cleanups.push(addErrorReporter((error) => reported.push(error)));
    return { entries, reported };
  }

  it("reports unexpected errors with the request id, never the server's message as context", () => {
    const { entries, reported } = listen();
    const error = apiError(500, "INTERNAL_ERROR");

    expect(reportError(error, { source: "mutation" })).toBe("unexpected");
    expect(reported).toEqual([error]);
    expect(entries.at(-1)).toMatchObject({
      level: "error",
      context: { source: "mutation", status: 500, code: "INTERNAL_ERROR", requestId: "req-7" },
    });
  });

  it("only notes expected errors", () => {
    const { entries, reported } = listen();

    reportError(apiError(404, "NOT_FOUND"));

    expect(reported).toEqual([]);
    expect(entries.at(-1)?.level).toBe("debug");
  });

  it("survives a broken reporter", () => {
    cleanups.push(
      addErrorReporter(() => {
        throw new Error("reporter down");
      }),
    );

    expect(() => reportError(new Error("boom"))).not.toThrow();
  });
});

describe("router errors", () => {
  afterEach(() => sessionStorage.clear());

  const chunkError = new TypeError("Failed to fetch dynamically imported module: /assets/Notes-abc.js");

  it("recognizes files of an older build", () => {
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
  });

  it("reloads once after a deploy and reports a second failure", () => {
    const reload = vi.fn();
    const reported: unknown[] = [];
    const remove = addErrorReporter((error) => reported.push(error));

    handleRouterError(chunkError, "/k/abc/notizen", reload);
    handleRouterError(chunkError, "/k/abc/notizen", reload);
    remove();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith("/k/abc/notizen");
    expect(reported).toEqual([chunkError]);
  });
});
