import type { FastifyInstance } from "fastify";

import { buildApp } from "#src/app";
import { getEnv, type AppEnv } from "#core/env";
import { getErrorReporter } from "#core/log/errorReporter";
import { createLogger, loggerSettingsFromEnv, type AppLogger } from "#core/log/logger";
import { installProcessErrorHandlers } from "#core/log/processErrors";
import { reportError } from "#core/log/reportError";
import { bootstrapS3Storage } from "#core/runtime/storageBootstrap";
import {
  logStartupInfo,
  shouldSuppressStartupInfo,
} from "#core/runtime/startupInfo";

type ShutdownReason = "SIGINT" | "SIGTERM" | "STARTUP_FAILURE";

export class BackendRuntime {
  private readonly env: AppEnv;

  private readonly logger: AppLogger;

  private readonly app: FastifyInstance;

  private isShuttingDown = false;

  constructor(env: AppEnv = getEnv()) {
    this.env = env;
    this.logger = createLogger(loggerSettingsFromEnv(env, "api"));
    installProcessErrorHandlers(this.logger, () => this.app.close());
    this.app = buildApp({ env, logger: this.logger });
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
      reportError(this.logger, error, "Failed to start server", { task: "startup", fatal: true });
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
      this.logger.info({ signal: reason }, "Shutting down server");
    }

    try {
      await this.app.close();
      await getErrorReporter().flush();
      process.exit(reason === "STARTUP_FAILURE" ? 1 : 0);
    } catch (error) {
      reportError(this.logger, error, "Failed to close server gracefully", { task: "shutdown" });
      await getErrorReporter().flush();
      process.exit(1);
    }
  }
}
