import argon2 from "argon2";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { users } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const PASSWORD = "super-secure-password";
const FIREFOX = "Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/133.0";
const PHONE = "Mozilla/5.0 (iPhone) AppleWebKit Mobile Safari";

type Cookies = Record<string, string>;
type CookieResponse = { cookies: Array<{ name: string; value: string }> };

function cookiesOf(response: CookieResponse): Cookies {
  return Object.fromEntries(response.cookies.filter((cookie) => cookie.value).map((cookie) => [cookie.name, cookie.value]));
}

/**
 * Own sessions and trusted devices: each browser sees its own marked as current, can end single
 * ones and never reaches those of another account.
 */
describe("own sessions and trusted devices", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // The real per-request check, so an ended session ends its access token too.
  const { app } = buildTestApp({ realSessionState: true });

  async function login(email: string, userAgent: string, trustDevice = false): Promise<Cookies> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD, trustDevice },
      headers: { "user-agent": userAgent },
    });
    expect(response.statusCode).toBe(200);
    return cookiesOf(response);
  }

  function request(method: "GET" | "DELETE" | "POST", url: string, cookies: Cookies) {
    return app.inject({ method, url, cookies });
  }

  beforeEach(async () => {
    for (const email of ["one@example.test", "two@example.test"]) {
      await db.insert(users).values({
        email,
        passwordHash: await argon2.hash(PASSWORD),
        displayName: "Player",
        systemRole: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      });
    }
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("lists the own sessions with the asking one first and ends another one", async () => {
    const laptop = await login("one@example.test", FIREFOX);
    const phone = await login("one@example.test", PHONE);
    await login("two@example.test", FIREFOX);

    const listed = await request("GET", "/api/v1/auth/sessions", laptop);
    expect(listed.statusCode).toBe(200);
    const items = listed.json().items as Array<{ id: string; userAgent: string; current: boolean; startedAt: string; lastActiveAt: string }>;
    // Each session started with its own first token, not with the oldest token of the account.
    expect(items[1]!.startedAt).toBe(items[1]!.lastActiveAt);
    expect(items[0]!.startedAt < items[1]!.startedAt).toBe(true);
    expect(items.map((item) => [item.userAgent, item.current])).toEqual([
      [FIREFOX, true],
      [PHONE, false],
    ]);

    const phoneSession = items[1]!.id;
    const ended = await request("DELETE", `/api/v1/auth/sessions/${phoneSession}`, laptop);
    expect(ended.statusCode).toBe(204);
    // The laptop stays signed in, so its cookies are left alone.
    expect(ended.cookies.filter((cookie) => cookie.name === "refresh_token")).toEqual([]);

    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {},
      cookies: { refresh_token: phone.refresh_token! },
    });
    expect(refreshed.statusCode).toBe(401);
    expect((await request("GET", "/api/v1/auth/sessions", laptop)).json().items).toHaveLength(1);
  }, 30_000);

  it("treats another account's session like an unknown one", async () => {
    const mine = await login("one@example.test", FIREFOX);
    const theirs = await login("two@example.test", PHONE);
    const [theirSession] = (await request("GET", "/api/v1/auth/sessions", theirs)).json().items;

    expect((await request("DELETE", `/api/v1/auth/sessions/${theirSession.id}`, mine)).statusCode).toBe(404);
    expect((await request("GET", "/api/v1/auth/sessions", theirs)).json().items).toHaveLength(1);
  }, 30_000);

  it("signs out when the own session is ended", async () => {
    const laptop = await login("one@example.test", FIREFOX);
    const [own] = (await request("GET", "/api/v1/auth/sessions", laptop)).json().items;

    const ended = await request("DELETE", `/api/v1/auth/sessions/${own.id}`, laptop);
    expect(ended.statusCode).toBe(204);
    expect(ended.cookies.find((cookie) => cookie.name === "refresh_token")?.value).toBe("");
  }, 30_000);

  it("lists trusted devices, marks this browser and removes single ones", async () => {
    const laptop = await login("one@example.test", FIREFOX, true);
    await login("one@example.test", PHONE, true);
    const other = await login("two@example.test", PHONE, true);

    const listed = (await request("GET", "/api/v1/me/trusted-devices", laptop)).json().items as Array<{
      id: string;
      userAgent: string;
      current: boolean;
    }>;
    expect(listed.map((device) => [device.userAgent, device.current])).toEqual([
      [FIREFOX, true],
      [PHONE, false],
    ]);

    const [otherDevice] = (await request("GET", "/api/v1/me/trusted-devices", other)).json().items;
    expect((await request("DELETE", `/api/v1/me/trusted-devices/${otherDevice.id}`, laptop)).statusCode).toBe(404);

    const removed = await request("DELETE", `/api/v1/me/trusted-devices/${listed[0]!.id}`, laptop);
    expect(removed.statusCode).toBe(204);
    expect(removed.cookies.find((cookie) => cookie.name === "trusted_device")?.value).toBe("");
    expect((await request("GET", "/api/v1/me/trusted-devices", laptop)).json().items).toEqual([
      expect.objectContaining({ userAgent: PHONE, current: false }),
    ]);
  }, 30_000);

  it("reports how the account signs in", async () => {
    const laptop = await login("one@example.test", FIREFOX);
    const me = await request("GET", "/api/v1/me", laptop);

    expect(me.json().signIn).toEqual({ password: true, providers: [] });
  }, 30_000);
  it("rejects the access token of an ended session at once, while the others keep working", async () => {
    const laptop = await login("one@example.test", FIREFOX);
    const phone = await login("one@example.test", PHONE);
    const phoneSession = ((await request("GET", "/api/v1/auth/sessions", phone)).json().items as Array<{ id: string; current: boolean }>).find(
      (session) => session.current,
    )!.id;

    expect((await request("GET", "/api/v1/me", phone)).statusCode).toBe(200);
    expect((await request("DELETE", `/api/v1/auth/sessions/${phoneSession}`, laptop)).statusCode).toBe(204);

    expect((await request("GET", "/api/v1/me", { access_token: phone.access_token! })).statusCode).toBe(401);
    expect((await request("GET", "/api/v1/me", laptop)).statusCode).toBe(200);
  }, 30_000);

  it("ends the access token when signing out on this device", async () => {
    const laptop = await login("one@example.test", FIREFOX);

    const loggedOut = await app.inject({ method: "POST", url: "/api/v1/auth/logout", payload: {}, cookies: laptop });
    expect(loggedOut.statusCode).toBe(204);
    expect((await request("GET", "/api/v1/me", { access_token: laptop.access_token! })).statusCode).toBe(401);
  }, 30_000);

  it("keeps the access token valid across a refresh of its session", async () => {
    const laptop = await login("one@example.test", FIREFOX);
    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {},
      cookies: { refresh_token: laptop.refresh_token! },
    });
    expect(refreshed.statusCode).toBe(200);

    expect((await request("GET", "/api/v1/me", { access_token: laptop.access_token! })).statusCode).toBe(200);
  }, 30_000);
});
