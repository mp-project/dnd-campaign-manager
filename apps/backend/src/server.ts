import { buildApp } from "#src/app";
import { getEnv, type AppEnv } from "#core/env";
import { ensureS3BucketAndCors } from "#core/storage/s3Storage";

function shouldSuppressStartupInfo(level: string): boolean {
  return level === "trace" || level === "debug" || level === "info";
}

function buildPublicApiUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("api/v1", normalizedBase).toString().replace(/\/$/, "");
}

function isDevelopmentRuntime(env: AppEnv): boolean {
  return env.NODE_ENV === "development";
}

function hasExplicitUrlPort(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.port.trim().length > 0;
  } catch {
    return false;
  }
}

function resolveStorageEndpointForLog(env: AppEnv): string | null {
  if (!isDevelopmentRuntime(env) || env.STORAGE_DRIVER !== "s3") {
    return null;
  }

  const endpoint = env.STORAGE_S3_ENDPOINT?.trim();

  if (!endpoint || !hasExplicitUrlPort(endpoint)) {
    return null;
  }

  return endpoint;
}

function resolveStorageDashboardUrl(env: AppEnv): string | null {
  if (!isDevelopmentRuntime(env) || env.STORAGE_DRIVER !== "s3") {
    return null;
  }

  const dashboardUrl = env.STORAGE_S3_DASHBOARD_URL?.trim();

  if (!dashboardUrl || !hasExplicitUrlPort(dashboardUrl)) {
    return null;
  }

  return dashboardUrl;
}

function resolveMailpitUiUrl(env: AppEnv): string | null {
  if (!isDevelopmentRuntime(env) || env.MAIL_DRIVER !== "smtp") {
    return null;
  }

  const mailpitUiUrl = env.MAILPIT_UI_URL?.trim();

  if (!mailpitUiUrl || !hasExplicitUrlPort(mailpitUiUrl)) {
    return null;
  }

  return mailpitUiUrl;
}

function resolveAdminerUiUrl(env: AppEnv): string | null {
  if (!isDevelopmentRuntime(env)) {
    return null;
  }

  const dashboardPort = process.env.DB_DASHBOARD_PORT?.trim();

  if (!dashboardPort) {
    return null;
  }

  return `http://127.0.0.1:${dashboardPort}`;
}

/**
 * Resolves browser origins that may fetch signed S3 download URLs.
 *
 * @param env Validated runtime environment.
 * @returns Normalized list of allowed origins.
 */
function resolveStorageCorsOrigins(env: AppEnv): string[] {
  const source = env.STORAGE_S3_BOOTSTRAP_CORS_ORIGINS ?? env.CORS_ORIGIN;

  return source
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

  /**
   * Runs optional S3 bootstrap before the HTTP server starts listening.
   *
   * @param env Validated runtime environment.
   * @returns Promise that resolves after bootstrap or immediately when disabled.
   */
async function bootstrapS3Storage(env: AppEnv): Promise<void> {
  if (env.STORAGE_DRIVER !== "s3" || !env.STORAGE_S3_AUTO_BOOTSTRAP) {
    return;
  }

  const bootstrapOptions: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
    allowedOrigins: string[];
  } = {
    bucket: env.STORAGE_S3_BUCKET!,
    region: env.STORAGE_S3_REGION,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    allowedOrigins: resolveStorageCorsOrigins(env),
  };

  if (env.STORAGE_S3_ENDPOINT) {
    bootstrapOptions.endpoint = env.STORAGE_S3_ENDPOINT;
  }

  await ensureS3BucketAndCors(bootstrapOptions);
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
    await bootstrapS3Storage(env);

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

    const adminerUiUrl = resolveAdminerUiUrl(env);

    if (adminerUiUrl) {
      console.log(`DB Dashboard (Adminer): ${adminerUiUrl}`);
    }

    if (!isDevelopmentRuntime(env)) {
      return;
    }

    const storageEndpointForLog = resolveStorageEndpointForLog(env);

    if (storageEndpointForLog) {
      console.log(`Storage: s3 (${storageEndpointForLog})`);

      const dashboardUrl = resolveStorageDashboardUrl(env);

      if (dashboardUrl) {
        console.log(`Storage Dashboard: ${dashboardUrl}`);
      }
    }

    const mailpitUiUrl = resolveMailpitUiUrl(env);

    if (mailpitUiUrl) {
      console.log(`Mailpit Inbox: ${mailpitUiUrl}`);
    }
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

void startServer();
