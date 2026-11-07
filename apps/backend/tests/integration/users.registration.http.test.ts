import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { users } from "#core/db/schema";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { emailVerificationRequests } from "#src/modules/users/domain/entities/UsersTable";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const PASSWORD = "super-secure-password";
const VERIFICATION_FAILED = "Verification code is invalid or expired";

function extractVerificationCode(message: EmailMessage | undefined): string {
  const match = message?.text.match(/(\d{6})/);

  if (!match) {
    throw new Error("Verification code not found in email text");
  }

  return match[1] as string;
}

function extractVerificationLink(message: EmailMessage | undefined): URL {
  const match = message?.text.match(/https?:\/\/\S+/);

  if (!match) {
    throw new Error("Verification link not found in email text");
  }

  return new URL(match[0]);
}

describe("users registration verification HTTP routes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const sentEmails: EmailMessage[] = [];
  const emailPort: EmailPort = {
    async send(message) {
      sentEmails.push(message);
    },
  };

  const { app } = buildTestApp({
    publicPorts: {
      emailPort,
    },
  });

  beforeEach(() => {
    sentEmails.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  function register(email: string, password = PASSWORD) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, displayName: "New Player", password },
    });
  }

  function verify(email: string, verificationCode: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/register/verify-email",
      payload: { email, verificationCode },
    });
  }

  function login(email: string, password = PASSWORD) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
  }

  it("creates user as unverified and verifies with the emailed code", async () => {
    const email = "new.player@example.test";

    const registerResponse = await register(email);

    expect(registerResponse.statusCode).toBe(202);
    expect(registerResponse.json()).toEqual({ status: "accepted" });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(email);

    const [created] = await db.select().from(users).where(eq(users.email, email));
    expect(created).toMatchObject({
      username: "new-player",
      userTag: expect.stringMatching(/^new-player#[0-9]{6}$/),
      emailVerifiedAt: null,
    });

    const verifyResponse = await verify(email, extractVerificationCode(sentEmails[0]));

    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toMatchObject({
      email,
      displayName: "New Player",
      status: "ACTIVE",
      systemRole: "USER",
    });
    expect(verifyResponse.json().emailVerifiedAt).not.toBeNull();
    expect((await login(email)).statusCode).toBe(200);
  });

  it("verifies by the emailed link without signing anybody in", async () => {
    const email = "link.verify@example.test";

    expect((await register(email)).statusCode).toBe(202);

    const link = extractVerificationLink(sentEmails[0]);
    const first = await app.inject({
      method: "GET",
      url: `${link.pathname}${link.search}`,
    });

    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toBe("http://app.localhost:5173/login?verified=1");
    expect(first.headers["set-cookie"]).toBeUndefined();

    const [created] = await db.select().from(users).where(eq(users.email, email));
    expect(created?.emailVerifiedAt).not.toBeNull();

    const second = await app.inject({
      method: "GET",
      url: `${link.pathname}${link.search}`,
    });

    expect(second.statusCode).toBe(302);
    expect(second.headers.location).toBe("http://app.localhost:5173/login?verified=0");
  });

  it("only accepts the newest code after a new one was requested", async () => {
    const email = "resend@example.test";

    await register(email);
    const firstCode = extractVerificationCode(sentEmails[0]);

    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/request-verification",
      payload: { email },
    });

    expect(resend.statusCode).toBe(202);
    expect(resend.json()).toEqual({ status: "accepted" });
    const secondCode = extractVerificationCode(sentEmails[1]);

    if (firstCode !== secondCode) {
      const stale = await verify(email, firstCode);
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.message).toBe(VERIFICATION_FAILED);
    }

    expect((await verify(email, secondCode)).statusCode).toBe(200);
  });

  it("refuses an expired code with the same answer as a wrong one", async () => {
    const email = "expire@example.test";

    await register(email);
    await db
      .update(emailVerificationRequests)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(emailVerificationRequests.email, email));

    const response = await verify(email, extractVerificationCode(sentEmails[0]));

    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toBe(VERIFICATION_FAILED);
  });

  describe("F-09: no hints about existing accounts", () => {
    it("answers a taken address like a free one and mails its owner instead", async () => {
      const email = "owner@example.test";

      await register(email);
      await verify(email, extractVerificationCode(sentEmails[0]));
      sentEmails.length = 0;

      const again = await register(email, "attacker-password-123");

      expect(again.statusCode).toBe(202);
      expect(again.json()).toEqual({ status: "accepted" });
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.to).toBe(email);
      // An information email, not a code.
      expect(sentEmails[0]?.text).not.toMatch(/\b\d{6}\b/);

      // The owner's password stays.
      expect((await login(email)).statusCode).toBe(200);
      expect((await login(email, "attacker-password-123")).statusCode).toBe(401);
    });

    it("lets the latest registration set the password while the address is unverified", async () => {
      const email = "contested@example.test";

      await register(email, "first-registrant-pw");
      await register(email, "second-registrant-pw");

      const response = await verify(email, extractVerificationCode(sentEmails.at(-1)));
      expect(response.statusCode).toBe(200);

      expect((await login(email, "first-registrant-pw")).statusCode).toBe(401);
      expect((await login(email, "second-registrant-pw")).statusCode).toBe(200);
    });

    it("answers a new code request the same way for unknown and verified addresses", async () => {
      const verified = "verified@example.test";

      await register(verified);
      await verify(verified, extractVerificationCode(sentEmails[0]));
      sentEmails.length = 0;

      for (const email of [verified, "unknown@example.test"]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/auth/register/request-verification",
          payload: { email },
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({ status: "accepted" });
      }

      expect(sentEmails).toHaveLength(0);
    });

    it("answers verification for unknown and verified addresses like a wrong code", async () => {
      const verified = "verified2@example.test";

      await register(verified);
      const code = extractVerificationCode(sentEmails[0]);
      await verify(verified, code);

      for (const response of [
        await verify("unknown2@example.test", "123456"),
        await verify(verified, code),
      ]) {
        expect(response.statusCode).toBe(409);
        expect(response.json().error.message).toBe(VERIFICATION_FAILED);
      }
    });
  });
});
