/**
 * Where unexpected errors are reported besides the log (Sentry, once it is set up). Expected 4xx
 * errors never reach it. Without a reporter nothing leaves the process, which is the case
 * locally, in tests and in CI.
 */
export type ErrorReportContext = {
  /** Background work the error happened in, e.g. `media.variants` or `history.handler`. */
  task?: string;
  requestId?: string;
  route?: string;
  userId?: string | null;
  campaignId?: string | null;
  errorCode?: string;
  /** The process is going down because of this error. */
  fatal?: boolean;
  [key: string]: unknown;
};

export type ErrorReporter = {
  capture(error: unknown, context: ErrorReportContext): void;
  /** Sends what is still queued; resolves false when the time ran out. */
  flush(timeoutMs?: number): Promise<boolean>;
};

export const noopErrorReporter: ErrorReporter = {
  capture() {},
  flush() {
    return Promise.resolve(true);
  },
};

let processReporter: ErrorReporter = noopErrorReporter;

/** Installed once at start; the API, the worker and scripts share it. */
export function installErrorReporter(reporter: ErrorReporter): void {
  processReporter = reporter;
}

export function getErrorReporter(): ErrorReporter {
  return processReporter;
}
