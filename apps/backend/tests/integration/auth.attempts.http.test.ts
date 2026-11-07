import argon2 from "argon2";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { authAttempts, users } from "#core/db/schema";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { loginAttemptKeys } from "#src/modules/auth/service/AuthAttemptService";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const PASSWORD = "super-secure-password";
const SHARED_IP = "203.0.113.10";

describe("auth attempt tracking", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const sentEmails: EmailMessage[] = [];
  const emailPort: EmailPort = {
    async send(message) {
      sentEmails.push(message);
    },
  };
  const { app } = buildTestApp({ publicPorts: { emailPort } });

  function post(url: string, payload: object, ip: string = SHARED_IP) {
    return app.inject({
      method: "POST",
      url: `/api/v1/auth/${url}`,
      payload,
      headers: { "x-forwarded-for": ip },
      remoteAddress: "172.18.0.2",
    });
  }

  function login(email: string, password: string, ip?: string) {
    return post("login", { email, password }, ip);
  }

  async function create(email: string) {
    await db.insert(users).values({
      email,
      passwordHash: await argon2.hash(PASSWORD),
      displayName: "Player",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
  }

  async function failLogins(email: string, count: number) {
    for (let attempt = 0; attempt < count; attempt += 1) {
      const response = await login(email, "wrong-password");

      expect(response.statusCode).toBe(401);
    }
  }

  beforeEach(() => {
    sentEmails.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("blocks login after failed attempts, even with the correct password", async () => {
    const email = "blocked@example.test";
    await create(email);
    await failLogins(email, 10);

    const response = await login(email, PASSWORD);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  }, 30_000);

  it("does not block other users in the same network", async () => {
    await create("first@example.test");
    await create("second@example.test");
    await failLogins("first@example.test", 10);

    expect((await login("second@example.test", PASSWORD)).statusCode).toBe(200);
  }, 30_000);

  it("does not block the user from another network until the account limit", async () => {
    const email = "other-network@example.test";
    await create(email);
    await failLogins(email, 10);

    expect((await login(email, PASSWORD, "198.51.100.1")).statusCode).toBe(200);
  }, 30_000);

  it("blocks an account attacked from many addresses", async () => {
    const email = "distributed@example.test";
    await create(email);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await login(email, "wrong-password", `198.51.100.${attempt + 1}`);
    }

    expect((await login(email, PASSWORD, "198.51.100.200")).statusCode).toBe(429);
  }, 30_000);

  it("resets the failures of a device after a successful login", async () => {
    const email = "reset@example.test";
    await create(email);
    await failLogins(email, 9);

    expect((await login(email, PASSWORD)).statusCode).toBe(200);

    await failLogins(email, 9);

    expect((await login(email, PASSWORD)).statusCode).toBe(200);
  }, 30_000);

  it("blocks an IP only at its high limit", async () => {
    const ip = "198.51.100.77";
    const ipKey = loginAttemptKeys("any@example.test", ip).all[2]!;
    await db.insert(authAttempts).values({
      keyHash: ipKey.hash,
      action: "LOGIN",
      count: 199,
      windowExpiresAt: new Date(Date.now() + 60_000),
    });

    expect((await login("attacker@example.test", "wrong-password", ip)).statusCode).toBe(401);
    expect((await login("victim@example.test", "wrong-password", ip)).statusCode).toBe(429);
  }, 30_000);

  it("starts counting again after a block has expired", async () => {
    const email = "expired-block@example.test";
    await create(email);
    await failLogins(email, 10);
    await db.update(authAttempts).set({
      blockedUntil: new Date(Date.now() - 1_000),
      windowExpiresAt: new Date(Date.now() - 1_000),
    });

    expect((await login(email, "wrong-password")).statusCode).toBe(401);
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
  }, 30_000);

  it("blocks a refresh token after repeated failures", async () => {
    const payload = { refreshToken: "a".repeat(64) };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post("refresh", payload)).statusCode).toBe(401);
    }

    expect((await post("refresh", payload)).statusCode).toBe(429);
    expect((await post("refresh", { refreshToken: "b".repeat(64) })).statusCode).toBe(401);
  });

  it("does not count a refresh without token", async () => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      expect((await post("refresh", {})).statusCode).toBe(401);
    }
  });

  it("limits auth emails per recipient the same way for unknown accounts", async () => {
    await create("known@example.test");

    for (const email of ["known@example.test", "unknown@example.test"]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await post("forgot-password", { email })).statusCode).toBeLessThan(300);
      }

      expect((await post("forgot-password", { email })).statusCode).toBe(429);
    }

    expect(sentEmails).toHaveLength(5);
  }, 30_000);

  it("expires a verification code after five wrong attempts", async () => {
    const email = "verify@example.test";
    const registered = await post("register", {
      email,
      displayName: "Verify Me",
      password: PASSWORD,
    });
    expect(registered.statusCode).toBe(202);
    const verificationCode = sentEmails.at(-1)?.text.match(/(\d{6})/)?.[1] as string;
    const wrongCode = verificationCode === "000000" ? "000001" : "000000";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await post("register/verify-email", {
        email,
        verificationCode: wrongCode,
      });

      expect(response.statusCode).toBe(409);
    }

    const response = await post("register/verify-email", {
      email,
      verificationCode,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toBe("Verification code is invalid or expired");
  }, 30_000);

  it("blocks verification for an email after repeated failures", async () => {
    const payload = {
      email: "missing@example.test",
      verificationCode: "123456",
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post("register/verify-email", payload)).statusCode).toBe(409);
    }

    expect((await post("register/verify-email", payload)).statusCode).toBe(429);
  });
});
