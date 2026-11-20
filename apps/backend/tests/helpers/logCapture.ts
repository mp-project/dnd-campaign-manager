import { Writable } from "node:stream";

import { createLogger, type AppLogger } from "#core/log/logger";

export type CapturedLogLine = {
  level: number;
  msg: string;
  [key: string]: unknown;
};

export const LOG_LEVEL_VALUES = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

/** A real backend logger whose lines a test can read, parsed as JSON. */
export function captureLogs(): {
  logger: AppLogger;
  lines(): CapturedLogLine[];
  find(message: string): CapturedLogLine[];
} {
  const raw: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      raw.push(chunk.toString("utf8"));
      done();
    },
  });
  const logger = createLogger(
    { service: "test", level: "trace", pretty: false, environment: "test" },
    destination,
  );
  const lines = () =>
    raw
      .join("")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CapturedLogLine);

  return {
    logger,
    lines,
    find: (message) => lines().filter((line) => line.msg === message),
  };
}

/** A logger that writes nothing, for services that need one. */
export function silentLogger(): AppLogger {
  return createLogger({ service: "test", level: "silent", pretty: false, environment: "test" });
}
