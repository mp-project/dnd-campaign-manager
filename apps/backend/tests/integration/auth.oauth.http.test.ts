import { encodeSignedJson } from "#src/modules/auth/utils/crypto";
import { buildTestApp } from "#test/helpers/buildTestApp";
import { createTestEnv } from "#test/helpers/testEnv";

const FRONTEND = "http://app.localhost:5173";

/**
 * The browser reaches the OAuth routes by navigation, so they always answer with a redirect to the
 * frontend's OAuth page, also on failure. No provider is configured in tests.
 */
describe("OAuth redirects", () => {
  const { app } = buildTestApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  function location(response: { headers: Record<string, unknown> }): URL {
    return new URL(String(response.headers.location));
  }

  it("sends an unconfigured provider back with its error code", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/GOOGLE/start?intent=login&redirect=/k/abc",
    });

    expect(response.statusCode).toBe(302);
    const target = location(response);
    expect(`${target.origin}${target.pathname}`).toBe(`${FRONTEND}/login/oauth`);
    expect(target.searchParams.get("status")).toBe("error");
    expect(target.searchParams.get("code")).toBe("OAUTH_PROVIDER_UNAVAILABLE");
    expect(target.searchParams.get("redirect")).toBe("/k/abc");
  });

  it("accepts the extra parameters providers add and redirects a failed callback", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/GOOGLE/callback?code=abc&state=xyz&scope=email%20profile&authuser=0&prompt=consent",
    });

    expect(response.statusCode).toBe(302);
    const target = location(response);
    expect(target.pathname).toBe("/login/oauth");
    expect(target.searchParams.get("status")).toBe("error");
    // No state cookie: the signed state can't be checked.
    expect(target.searchParams.get("code")).toBe("OAUTH_STATE_INVALID");
    expect(target.searchParams.get("redirect")).toBe("/");
  });

  it("redirects a sign-in cancelled at the provider", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/DISCORD/callback?error=access_denied&error_description=cancelled",
    });

    expect(response.statusCode).toBe(302);
    const target = location(response);
    expect(target.pathname).toBe("/login/oauth");
    expect(target.searchParams.get("code")).toBe("OAUTH_CALLBACK_FAILED");
  });
  it("returns to the page the sign-in started from when the callback fails", async () => {
    const state = encodeSignedJson(
      { state: "s1", provider: "GOOGLE", intent: "login", redirectPath: "/k/abc/welt", nonce: undefined, expiresAt: Date.now() + 60_000 },
      createTestEnv({}).OAUTH_STATE_SECRET!,
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/GOOGLE/callback?error=access_denied",
      cookies: { oauth_state_ctx: state },
    });

    const target = location(response);
    expect(target.searchParams.get("code")).toBe("OAUTH_CALLBACK_FAILED");
    expect(target.searchParams.get("redirect")).toBe("/k/abc/welt");
  });
});
