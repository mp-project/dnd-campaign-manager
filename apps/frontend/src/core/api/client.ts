import createClient, { type Client } from "openapi-fetch";

import { createAuthFetch, type SessionExpiredListener } from "@/core/api/authFetch";
import { networkError, toApiError } from "@/core/api/errors";
import type { operations, paths } from "@/core/api/generated/schema";

/**
 * The typed API client. Paths, parameters, bodies and responses come from the generated OpenAPI
 * types (`npm run api:types`), so a changed backend route is a compile error here.
 *
 *   const campaign = await unwrap(api.GET("/api/v1/campaigns/{campaignId}", {
 *     params: { path: { campaignId } },
 *   }));
 */
export type ApiClient = Client<paths>;

type JsonOf<R> = R extends { content: { "application/json": infer T } } ? T : never;

/** JSON body of an operation's success answer, by operation id: `ApiData<"getCampaignById">`. */
export type ApiData<Operation extends keyof operations> = operations[Operation]["responses"] extends infer R
  ? R extends { 200: infer Ok }
    ? JsonOf<Ok>
    : R extends { 201: infer Created }
      ? JsonOf<Created>
      : never
  : never;

const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Called once per expired session (refresh failed); returns the unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/**
 * The OpenAPI paths contain the `/api/v1` prefix, so the client's base is the API origin.
 * `VITE_API_BASE_URL` keeps naming the versioned base (`…/api/v1`) like before.
 */
export function apiOrigin(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

export function createApiClient(options: {
  apiBaseUrl: string;
  fetch?: typeof globalThis.fetch;
}): ApiClient {
  const authFetch = createAuthFetch({
    baseUrl: options.apiBaseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    onSessionExpired: () => sessionExpiredListeners.forEach((listener) => listener()),
  });

  return createClient<paths>({
    baseUrl: apiOrigin(options.apiBaseUrl),
    credentials: "include",
    fetch: authFetch,
  });
}

export const api: ApiClient = createApiClient({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
});

type ClientResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Turns a client call into its data or a thrown `ApiError`, the shape Vue Query expects.
 * A missing response (offline, server down) becomes `NETWORK_ERROR`.
 */
export async function unwrap<T>(call: Promise<ClientResult<T>>): Promise<T> {
  let result: ClientResult<T>;

  try {
    result = await call;
  } catch (cause) {
    throw networkError(cause);
  }

  if (!result.response.ok) {
    throw toApiError(result.response, result.error);
  }

  // 204 and other empty answers have no data; their type says so (`never`/`undefined`).
  return result.data as T;
}
