import type { FastifyInstance } from "fastify";

import { buildApp } from "#src/app";
import { getEnv, type AppEnv } from "#core/env";
import { logRuntimeError, logWithLevel } from "#core/log/logger";
import { bootstrapS3Storage } from "#core/runtime/storageBootstrap";
import {
  logStartupInfo,
  shouldSuppressStartupInfo,
} from "#core/runtime/startupInfo";

type ShutdownReason = "SIGINT" | "SIGTERM" | "STARTUP_FAILURE";

export class BackendRuntime {
  private readonly env: AppEnv;

  private readonly app: FastifyInstance;

  private isShuttingDown = false;

  constructor(env: AppEnv = getEnv()) {
    this.env = env;
    this.app = buildApp({ env });
  }

  /**
   * Starts HTTP server and logs local development endpoints.
   */
  async start(): Promise<void> {
    try {
      await bootstrapS3Storage(this.env);

      const previousLogLevel = this.app.log.level;

      if (shouldSuppressStartupInfo(previousLogLevel)) {
        this.app.log.level = "warn";
      }

      await this.app.listen({
        host: this.env.HOST,
        port: this.env.PORT,
      });

      if (shouldSuppressStartupInfo(previousLogLevel)) {
        this.app.log.level = previousLogLevel;
      }

      await logStartupInfo(this.app, this.env);
    } catch (error) {
      logRuntimeError(this.app.log, "Failed to start server", error);
      await this.shutdown("STARTUP_FAILURE");
    }
  }

  /**
   * Gracefully shuts down the application.
   *
   * @param reason Trigger of the shutdown sequence.
   */
  async shutdown(reason: ShutdownReason): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    if (reason !== "STARTUP_FAILURE") {
      logWithLevel(this.app.log, "info", "Shutting down server", {
        signal: reason,
      });
    }

    try {
      await this.app.close();

      if (reason === "STARTUP_FAILURE") {
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      logRuntimeError(this.app.log, "Failed to close server gracefully", error);
      process.exit(1);
    }
  }
}
