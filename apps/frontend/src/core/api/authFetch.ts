/**
 * `fetch` with the session token. Every request carries the Clerk session token as `Authorization:
 * Bearer` (only once a page loaded Clerk; public pages send none). Clerk renews the short-lived
 * token itself; when a request still answers 401, a fresh token is fetched and the request runs once
 * more. If it answers 401 again, the session is over: the listeners (cache, router) are told and the
 * 401 goes to the caller.
 */

export type SessionExpiredListener = () => void;

/** The current session token, or null; `fresh` skips Clerk's cache. */
export type SessionTokenSource = (options?: { fresh?: boolean }) => Promise<string | null>;

export type AuthFetchOptions = {
  fetch?: typeof globalThis.fetch;
  sessionToken: SessionTokenSource;
  onSessionExpired?: SessionExpiredListener;
};

function withToken(request: Request, token: string | null): Request {
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${token}`);
  return new Request(request, { headers });
}

export function createAuthFetch(options: AuthFetchOptions): (request: Request) => Promise<Response> {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function authFetch(request: Request): Promise<Response> {
    // The body of a sent request is used up, so the retry needs its own copy.
    const retry = request.clone();
    const token = await options.sessionToken();
    const response = await send(withToken(request, token));

    // Without a token there is no session to renew; the 401 is the answer.
    if (response.status !== 401 || !token) {
      return response;
    }

    const fresh = await options.sessionToken({ fresh: true }).catch(() => null);
    const retried = fresh ? await send(withToken(retry, fresh)) : response;

    if (retried.status === 401) {
      options.onSessionExpired?.();
    }

    return retried;
  };
}
