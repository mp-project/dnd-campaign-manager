import { buildApp } from "#src/app";
import { getEnv } from "#core/env";

function shouldSuppressStartupInfo(level: string): boolean {
  return level === "trace" || level === "debug" || level === "info";
}

function buildPublicApiUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("api/v1", normalizedBase).toString().replace(/\/$/, "");
}

async function startServer(): Promise<void> {
  const env = getEnv();
  const app = buildApp({ env });

  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    app.log.info({ signal }, "Shutting down server");

    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Failed to close server gracefully");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    const previousLogLevel = app.log.level;

    if (shouldSuppressStartupInfo(previousLogLevel)) {
      app.log.level = "warn";
    }

    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });

    if (shouldSuppressStartupInfo(previousLogLevel)) {
      app.log.level = previousLogLevel;
    }

    const apiBaseUrl = buildPublicApiUrl(env.BACKEND_PUBLIC_BASE_URL);
    const apiProbeResponse = await app.inject({
      method: "GET",
      url: "/api/v1",
    });
    const apiStatus = apiProbeResponse.statusCode === 200 ? "OK" : "FAIL";

    console.log(`REST-API: ${apiBaseUrl} (${apiStatus})`);
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

void startServer();
