import argon2 from "argon2";
import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { trustedDevices, users } from "#core/db/schema";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const EMAIL = "device@example.test";
const OTHER_EMAIL = "other-device@example.test";
const PASSWORD = "super-secure-password";
const NEW_PASSWORD = "another-secure-password";
const COOKIE = "trusted_device";

type CookieResponse = { cookies: Array<{ name: string; value: string }> };

function deviceTokenOf(response: CookieResponse): string | undefined {
  return response.cookies.find((cookie) => cookie.name === COOKIE)?.value || undefined;
}

describe("auth trusted devices", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const sentEmails: EmailMessage[] = [];
  const emailPort: EmailPort = {
    async send(message) {
      sentEmails.push(message);
    },
  };
  const { app, injectAs } = buildTestApp({ publicPorts: { emailPort } });

  function login(
    options: { email?: string; password?: string; trustDevice?: boolean; device?: string } = {},
  ) {
    const { email = EMAIL, password = PASSWORD, trustDevice, device } = options;

    return app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, ...(trustDevice === undefined ? {} : { trustDevice }) },
      headers: device ? { cookie: `${COOKIE}=${device}` } : {},
    });
  }

  async function failLogins(count: number, device?: string) {
    for (let attempt = 0; attempt < count; attempt += 1) {
      await login({ password: "wrong-password", ...(device ? { device } : {}) });
    }
  }

  async function resetToken(): Promise<string> {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: EMAIL },
    });

    return new URL(/https?:\/\/\S+/.exec(sentEmails.at(-1)!.text)![0]).searchParams.get("token")!;
  }

  async function userId(): Promise<string> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));

    return user!.id;
  }

  beforeEach(async () => {
    sentEmails.length = 0;

    for (const email of [EMAIL, OTHER_EMAIL]) {
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

  it("links a device only when the checkbox is set", async () => {
    expect(deviceTokenOf(await login())).toBeUndefined();
    expect(deviceTokenOf(await login({ trustDevice: false }))).toBeUndefined();

    const device = deviceTokenOf(await login({ trustDevice: true }));
    const rows = await db.select().from(trustedDevices);

    expect(device).toBeDefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(device);
  }, 30_000);

  it("lets a trusted device log in while the account is blocked", async () => {
    const device = deviceTokenOf(await login({ trustDevice: true }))!;

    await failLogins(10);

    expect((await login()).statusCode).toBe(429);
    expect((await login({ device })).statusCode).toBe(200);
  }, 30_000);

  it("still requires the password and limits failures on a trusted device", async () => {
    const device = deviceTokenOf(await login({ trustDevice: true }))!;

    await failLogins(10, device);

    expect((await login({ device })).statusCode).toBe(429);
    expect((await login({ email: OTHER_EMAIL })).statusCode).toBe(200);
  }, 30_000);

  it("does not count failures of a trusted device against the account", async () => {
    const device = deviceTokenOf(await login({ trustDevice: true }))!;

    await failLogins(9, device);

    expect((await login()).statusCode).toBe(200);
  }, 30_000);

  it("ignores a device token of another account", async () => {
    const device = deviceTokenOf(await login({ email: OTHER_EMAIL, trustDevice: true }))!;

    await failLogins(10);

    expect((await login({ device })).statusCode).toBe(429);
  }, 30_000);

  it("ignores an expired device", async () => {
    const device = deviceTokenOf(await login({ trustDevice: true }))!;

    await db.update(trustedDevices).set({ expiresAt: new Date(Date.now() - 1_000) });
    await failLogins(10, device);

    expect((await login({ device })).statusCode).toBe(429);
  }, 30_000);

  it("links the current browser afterwards and removes it again", async () => {
    const actor = { actorId: await userId(), systemRole: "USER" } as const;
    const linked = await injectAs(actor, { method: "POST", url: "/api/v1/me/trusted-device" });
    const device = deviceTokenOf(linked)!;

    expect(linked.statusCode).toBe(204);

    await failLogins(10);

    expect((await login({ device })).statusCode).toBe(200);

    const removed = await injectAs(actor, {
      method: "DELETE",
      url: "/api/v1/me/trusted-device",
      headers: { cookie: `${COOKIE}=${device}` },
    });

    expect(removed.statusCode).toBe(204);
    expect(await db.select().from(trustedDevices)).toHaveLength(0);
    expect((await login({ device })).statusCode).toBe(429);
  }, 30_000);

  it("unblocks and links the device after a password reset during a block", async () => {
    await failLogins(10);

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: await resetToken(), newPassword: NEW_PASSWORD },
    });
    const device = deviceTokenOf(reset);

    expect(reset.statusCode).toBe(204);
    expect(device).toBeDefined();
    expect((await login({ password: NEW_PASSWORD })).statusCode).toBe(200);

    await failLogins(10);

    expect((await login({ password: NEW_PASSWORD })).statusCode).toBe(429);
    expect((await login({ password: NEW_PASSWORD, device: device! })).statusCode).toBe(200);
  }, 30_000);

  it("links no device after a normal password reset without the checkbox", async () => {
    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: await resetToken(), newPassword: NEW_PASSWORD },
    });

    expect(reset.statusCode).toBe(204);
    expect(deviceTokenOf(reset)).toBeUndefined();
  }, 30_000);

  it("removes devices when the password is changed", async () => {
    await login({ trustDevice: true });

    const changed = await injectAs(
      { actorId: await userId(), systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/me/change-password",
        payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      },
    );

    expect(changed.statusCode).toBe(204);
    expect(await db.select().from(trustedDevices)).toHaveLength(0);
  }, 30_000);

  it("removes old devices on password reset and logout from all devices", async () => {
    const oldDevice = deviceTokenOf(await login({ trustDevice: true }))!;

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: await resetToken(), newPassword: NEW_PASSWORD },
    });

    expect(await db.select().from(trustedDevices)).toHaveLength(0);

    await failLogins(10, oldDevice);

    expect((await login({ password: NEW_PASSWORD, device: oldDevice })).statusCode).toBe(429);

    await login({ email: OTHER_EMAIL, trustDevice: true });

    const [other] = await db.select({ id: users.id }).from(users).where(eq(users.email, OTHER_EMAIL));
    const loggedOut = await injectAs(
      { actorId: other!.id, systemRole: "USER" },
      { method: "POST", url: "/api/v1/auth/logout-all" },
    );

    expect(loggedOut.statusCode).toBe(204);
    expect(await db.select().from(trustedDevices)).toHaveLength(0);
  }, 30_000);
});
