/**
 * `fetch` with session renewal. The access token lives in an HttpOnly cookie with a short lifetime;
 * when a request answers 401, the refresh cookie gets a new one (`POST /auth/refresh`) and the request
 * runs once more. Parallel 401s share one refresh; a refresh another tab just made (409) counts as
 * renewed. If the request still answers 401, the session is over: the listeners (cache, router) are
 * told and the 401 goes to the caller.
 */

export type SessionExpiredListener = () => void;

export type AuthFetchOptions = {
  /** Base URL of the API, e.g. `http://api.localhost:3000/api/v1`. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  onSessionExpired?: SessionExpiredListener;
};

export function createAuthFetch(options: AuthFetchOptions): (request: Request) => Promise<Response> {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const refreshUrl = `${baseUrl}/auth/refresh`;
  // Auth routes answer 401 for wrong credentials or codes; renewing the session doesn't help there.
  const authPath = `${new URL(baseUrl, "http://localhost").pathname.replace(/\/$/, "")}/auth/`;
  let pendingRefresh: Promise<boolean> | null = null;

  async function refreshSession(): Promise<boolean> {
    pendingRefresh ??= send(
      // The route takes a JSON object (the token may come in the body); the browser sends the cookie.
      new Request(refreshUrl, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    )
      // 409: another tab renewed the session a moment ago; the browser already holds its new cookie.
      .then((response) => response.ok || response.status === 409)
      .catch(() => false)
      .finally(() => {
        pendingRefresh = null;
      });

    return pendingRefresh;
  }

  return async function authFetch(request: Request): Promise<Response> {
    const renewable = !new URL(request.url).pathname.startsWith(authPath);
    // The body of a sent request is used up, so the retry needs its own copy.
    const retry = renewable ? request.clone() : null;
    const response = await send(request);

    if (response.status !== 401 || !retry) {
      return response;
    }

    const retried = (await refreshSession()) ? await send(retry) : response;

    if (retried.status === 401) {
      options.onSessionExpired?.();
    }

    return retried;
  };
}
