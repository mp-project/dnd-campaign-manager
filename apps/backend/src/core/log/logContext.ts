import { AsyncLocalStorage } from "node:async_hooks";

import type { FastifyBaseLogger } from "fastify";

/**
 * What every log line written during one request or task carries, without passing a logger
 * around: services log with the app logger and still get the request id and the actor.
 */
export type LogContext = {
  requestId?: string;
  userId?: string | null;
  campaignId?: string | null;
  /** Background work outside a request (worker job, start-up task, script). */
  task?: string;
  /** The logger of the app serving the request; not written into lines. */
  logger?: FastifyBaseLogger;
  /** `LOG_CHANGE_VALUES` of the app serving the request; not written into lines. */
  changeValues?: boolean;
};

const storage = new AsyncLocalStorage<LogContext>();

let processLogger: FastifyBaseLogger | undefined;

/** The logger for lines outside a request (`recordChange` in scripts, start-up tasks). */
export function installProcessLogger(logger: FastifyBaseLogger): void {
  processLogger = logger;
}

/** The request's logger, else the process logger; undefined in tests without either. */
export function contextLogger(): FastifyBaseLogger | undefined {
  return storage.getStore()?.logger ?? processLogger;
}


export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

export function runWithLogContext<T>(context: LogContext, work: () => T): T {
  return storage.run(context, work);
}

/** Fields for pino's `mixin`: only the ones that are set, so lines stay short. */
export function logContextFields(): Record<string, unknown> {
  const context = storage.getStore();

  if (!context) {
    return {};
  }

  const fields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (key !== "logger" && key !== "changeValues" && value !== undefined && value !== null) {
      fields[key] = value;
    }
  }

  return fields;
}
