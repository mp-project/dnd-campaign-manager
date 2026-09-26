import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { users } from "#core/db/schema";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { emailVerificationRequests } from "#src/modules/users/domain/entities/UsersTable";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

function extractVerificationCode(message: EmailMessage): string {
  const match = message.text.match(/(\d{6})/);

  if (!match) {
    throw new Error("Verification code not found in email text");
  }

  return match[1] as string;
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

  it("creates user as unverified and verifies in separate step", async () => {
    const email = "new.player@example.test";

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        displayName: "New Player",
        password: "super-secure-password",
      },
    });

    expect(registerResponse.statusCode).toBe(201);
    const registerPayload = registerResponse.json();
    expect(registerPayload).toMatchObject({
      email,
      displayName: "New Player",
      status: "ACTIVE",
      systemRole: "USER",
      emailVerificationRequiredCode: "EMAIL_NOT_VERIFIED",
    });
    expect(typeof registerPayload.verificationId).toBe("string");
    expect(typeof registerPayload.verificationCode).toBe("string");
    expect(registerPayload.emailVerifiedAt).toBeNull();

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(email);

    const code = extractVerificationCode(sentEmails[0] as EmailMessage);

    const statusBeforeVerify = await app.inject({
      method: "GET",
      url: `/api/v1/auth/register/verification/${registerPayload.verificationId}/status`,
    });

    expect(statusBeforeVerify.statusCode).toBe(200);
    expect(statusBeforeVerify.json().status).toBe("PENDING");

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/verify-email",
      payload: {
        email,
        verificationId: registerPayload.verificationId,
        verificationCode: code,
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toMatchObject({
      email,
      displayName: "New Player",
      status: "ACTIVE",
      systemRole: "USER",
      verificationCode: null,
      emailVerificationRequiredCode: null,
    });
    expect(verifyResponse.json().emailVerifiedAt).not.toBeNull();

    const statusAfterVerify = await app.inject({
      method: "GET",
      url: `/api/v1/auth/register/verification/${registerPayload.verificationId}/status`,
    });

    expect(statusAfterVerify.statusCode).toBe(200);
    expect(statusAfterVerify.json().status).toBe("VERIFIED");
    expect(statusAfterVerify.json().verifiedAt).not.toBeNull();

    const createdUsers = await db.select().from(users).where(eq(users.email, email));
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]?.emailVerifiedAt).not.toBeNull();
  });

  it("supersedes older pending verification requests when a new code is requested", async () => {
    const email = "resend@example.test";

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        displayName: "Resend User",
        password: "super-secure-password",
      },
    });

    expect(registerResponse.statusCode).toBe(201);

    const firstRequestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/request-verification",
      payload: { email },
    });

    const secondRequestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/request-verification",
      payload: { email },
    });

    expect(firstRequestResponse.statusCode).toBe(202);
    expect(secondRequestResponse.statusCode).toBe(202);

    const firstPayload = firstRequestResponse.json();
    const secondPayload = secondRequestResponse.json();

    expect(firstPayload.verificationId).not.toBe(secondPayload.verificationId);

    const firstStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/auth/register/verification/${firstPayload.verificationId}/status`,
    });

    const secondStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/auth/register/verification/${secondPayload.verificationId}/status`,
    });

    expect(firstStatusResponse.statusCode).toBe(200);
    expect(firstStatusResponse.json().status).toBe("SUPERSEDED");
    expect(secondStatusResponse.statusCode).toBe(200);
    expect(secondStatusResponse.json().status).toBe("PENDING");
  });

  it("marks verification requests as expired after expiry time", async () => {
    const email = "expire@example.test";

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        displayName: "Expire User",
        password: "super-secure-password",
      },
    });

    expect(registerResponse.statusCode).toBe(201);
    const registerPayload = registerResponse.json();

    const requestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/request-verification",
      payload: { email },
    });

    expect(requestResponse.statusCode).toBe(202);
    const payload = requestResponse.json();

    await db
      .update(emailVerificationRequests)
      .set({
        expiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(emailVerificationRequests.id, payload.verificationId));

    expect(registerPayload.verificationId).not.toBe(payload.verificationId);

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/auth/register/verification/${payload.verificationId}/status`,
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().status).toBe("EXPIRED");
  });
});
