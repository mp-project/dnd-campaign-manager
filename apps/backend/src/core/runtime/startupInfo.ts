import type { FastifyInstance } from "fastify";

import { API_BASE_PATH } from "#core/config/constants";
import type { AppEnv } from "#core/env";

export function shouldSuppressStartupInfo(level: string): boolean {
  return level === "trace" || level === "debug" || level === "info";
}

function buildPublicApiUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(API_BASE_PATH.slice(1), normalizedBase)
    .toString()
    .replace(/\/$/, "");
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

export async function logStartupInfo(
  app: FastifyInstance,
  env: AppEnv,
): Promise<void> {
  const apiBaseUrl = buildPublicApiUrl(env.BACKEND_PUBLIC_BASE_URL);
  const apiProbeResponse = await app.inject({
    method: "GET",
    url: API_BASE_PATH,
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
}
