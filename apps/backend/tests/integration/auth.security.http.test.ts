import { eq } from "drizzle-orm";
import jsonwebtoken from "jsonwebtoken";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { users } from "#core/db/schema";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const PASSWORD = "super-secure-password";
const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";

function codeFrom(message: EmailMessage | undefined): string {
  const code = message?.text.match(/(\d{6})/)?.[1];

  if (!code) {
    throw new Error("No code in email");
  }

  return code;
}

function linkFrom(message: EmailMessage | undefined): URL {
  const link = message?.text.match(/https?:\/\/\S+/)?.[0];

  if (!link) {
    throw new Error("No link in email");
  }

  return new URL(link);
}

/**
 * Covers the fixes from the security review 2026-11-06 (F-01, F-04, F-05) against the real
 * session check: tokens are compared with status, role and session version in the database.
 */
describe("auth security fixes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const sentEmails: EmailMessage[] = [];
  const emailPort: EmailPort = {
    async send(message) {
      sentEmails.push(message);
    },
  };
  const { app, env } = buildTestApp({ publicPorts: { emailPort }, realSessionState: true });

  beforeEach(() => {
    sentEmails.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function registerVerifiedUser(email: string) {
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, displayName: "Player", password: PASSWORD },
    });

    expect(registered.statusCode).toBe(202);
    // F-01: the code only travels by email.
    expect(registered.json()).toEqual({ status: "accepted" });

    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/verify-email",
      payload: { email, verificationCode: codeFrom(sentEmails.at(-1)) },
    });

    expect(verified.statusCode).toBe(200);
    sentEmails.length = 0;

    return verified.json().id as string;
  }

  async function login(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);

    return response.json().accessToken as string;
  }

  function getMe(token: string) {
    return app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function adminToken() {
    return jsonwebtoken.sign({ systemRole: "ADMIN", sv: 0 }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      subject: ADMIN_ID,
      expiresIn: "15m",
    });
  }

  async function seedAdmin() {
    await db.insert(users).values({
      id: ADMIN_ID,
      email: "admin@example.test",
      passwordHash: "unused",
      displayName: "Admin",
      systemRole: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
  }

  describe("F-05: access tokens end with the session", () => {
    it("rejects the access token after logout from all devices", async () => {
      await registerVerifiedUser("logout@example.test");
      const token = await login("logout@example.test");

      expect((await getMe(token)).statusCode).toBe(200);

      const logoutAll = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout-all",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(logoutAll.statusCode).toBeLessThan(300);
      expect((await getMe(token)).statusCode).toBe(401);
    });

    it("rejects the access token after a password change", async () => {
      await registerVerifiedUser("password@example.test");
      const token = await login("password@example.test");

      const changed = await app.inject({
        method: "POST",
        url: "/api/v1/me/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: PASSWORD, newPassword: "another-secure-password" },
      });

      expect(changed.statusCode).toBe(204);
      expect((await getMe(token)).statusCode).toBe(401);
    });

    it("rejects the access token once an administrator locks the account", async () => {
      await seedAdmin();
      const userId = await registerVerifiedUser("locked@example.test");
      const token = await login("locked@example.test");
      const [row] = await db.select().from(users).where(eq(users.id, userId));

      const locked = await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken()}` },
        payload: { expectedVersion: row?.version, status: "LOCKED" },
      });

      expect(locked.statusCode).toBe(200);
      expect((await getMe(token)).statusCode).toBe(401);
    });

    it("takes the role from the database, not from the token", async () => {
      await seedAdmin();
      // The administrator lost the role, but still holds a token that says ADMIN.
      await db.update(users).set({ systemRole: "USER" }).where(eq(users.id, ADMIN_ID));

      const me = await getMe(adminToken());

      expect(me.statusCode).toBe(200);
      expect(me.json().systemRole).toBe("USER");

      const listAll = await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${ADMIN_ID}`,
        headers: { authorization: `Bearer ${adminToken()}` },
        payload: { expectedVersion: 1, status: "LOCKED" },
      });

      expect(listAll.statusCode).toBe(403);
    });

    it("rejects a validly signed token without session version", async () => {
      const userId = await registerVerifiedUser("nosv@example.test");
      const token = jsonwebtoken.sign({ systemRole: "USER" }, env.JWT_ACCESS_SECRET, {
        algorithm: "HS256",
        subject: userId,
        expiresIn: "15m",
      });

      expect((await getMe(token)).statusCode).toBe(401);
    });
  });

  describe("F-04: email change needs the password and a confirmation", () => {
    it("refuses a wrong password and changes nothing", async () => {
      const userId = await registerVerifiedUser("owner@example.test");
      const token = await login("owner@example.test");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "victim@example.test", currentPassword: "wrong-password" },
      });

      expect(response.statusCode).toBe(401);
      expect(sentEmails).toHaveLength(0);

      const [row] = await db.select().from(users).where(eq(users.id, userId));
      expect(row?.pendingEmail).toBeNull();
    });

    it("keeps the old address until the new one confirms the code", async () => {
      const userId = await registerVerifiedUser("before@example.test");
      const token = await login("before@example.test");
      const auth = { authorization: `Bearer ${token}` };

      const requested = await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change",
        headers: auth,
        payload: { email: "After@Example.test", currentPassword: PASSWORD },
      });

      expect(requested.statusCode).toBe(202);
      expect(requested.json().pendingEmail).toBe("after@example.test");
      expect(sentEmails.map((message) => message.to)).toEqual([
        "after@example.test",
        "before@example.test",
      ]);
      // The notice to the old address carries no code.
      expect(sentEmails[1]?.text).not.toMatch(/\d{6}/);

      const me = await getMe(token);
      expect(me.json()).toMatchObject({
        email: "before@example.test",
        pendingEmail: "after@example.test",
      });

      const wrong = await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change/confirm",
        headers: auth,
        payload: { verificationCode: codeFrom(sentEmails[0]) === "000000" ? "000001" : "000000" },
      });

      expect(wrong.statusCode).toBe(409);

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change/confirm",
        headers: auth,
        payload: { verificationCode: codeFrom(sentEmails[0]) },
      });

      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json().email).toBe("after@example.test");
      expect(confirmed.json().emailVerifiedAt).not.toBeNull();

      const [row] = await db.select().from(users).where(eq(users.id, userId));
      expect(row?.pendingEmail).toBeNull();
      expect(row?.pendingEmailCodeHash).toBeNull();
    });

    it("confirms through the emailed link without signing anybody in", async () => {
      const userId = await registerVerifiedUser("link@example.test");
      const token = await login("link@example.test");

      await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "link-new@example.test", currentPassword: PASSWORD },
      });

      const link = linkFrom(sentEmails[0]);
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/auth/email-change/confirm-link${link.search}`,
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers["set-cookie"]).toBeUndefined();

      const [row] = await db.select().from(users).where(eq(users.id, userId));
      expect(row?.email).toBe("link-new@example.test");
    });

    it("refuses an address that belongs to another account", async () => {
      await registerVerifiedUser("taken@example.test");
      await registerVerifiedUser("claimer@example.test");
      const token = await login("claimer@example.test");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/me/email-change",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "taken@example.test", currentPassword: PASSWORD },
      });

      expect(response.statusCode).toBe(409);
      expect(sentEmails).toHaveLength(0);
    });
  });
});
