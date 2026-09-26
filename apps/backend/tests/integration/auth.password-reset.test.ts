import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import type { EmailMessage, EmailPort } from "#core/email/index";
import { passwordResetTokens, users } from "#core/db/schema";
import { sha256 } from "#src/modules/auth/utils/crypto";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

function extractResetUrlFromEmail(message: EmailMessage): string {
  const match = message.text.match(/https?:\/\/\S+/);

  if (!match?.[0]) {
    throw new Error("Reset URL not found in email text");
  }

  return match[0];
}

function extractTokenFromResetUrl(resetUrl: string): string {
  const token = new URL(resetUrl).searchParams.get("token");

  if (!token) {
    throw new Error("Token query param not found in reset URL");
  }

  return token;
}

describe("auth password reset HTTP routes", () => {
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

  const userId = "99999999-9999-4999-8999-999999999999";
  const userEmail = "reset.target@example.test";

  beforeEach(async () => {
    sentEmails.length = 0;

    await db.insert(users).values({
      id: userId,
      email: userEmail,
      passwordHash: "legacy-password-hash",
      displayName: "Reset Target",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("sends localized reset email with URL token and stores only token hash", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {
        email: userEmail,
        locale: "de-DE",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(userEmail);
    expect(sentEmails[0]?.subject).toBe("Passwort zuruecksetzen");

    const resetUrl = extractResetUrlFromEmail(sentEmails[0] as EmailMessage);
    const parsedResetUrl = new URL(resetUrl);

    expect(parsedResetUrl.origin).toBe("http://app.localhost:5173");
    expect(parsedResetUrl.pathname).toBe("/auth/reset-password");

    const rawToken = extractTokenFromResetUrl(resetUrl);

    const tokenRows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));

    expect(tokenRows).toHaveLength(1);

    const storedToken = tokenRows[0];
    expect(storedToken?.consumedAt).toBeNull();
    expect(storedToken?.tokenHash).toBe(sha256(rawToken));
    expect(storedToken?.tokenHash).not.toBe(rawToken);
    expect(storedToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("invalidates older reset links when a new forgot-password request is sent", async () => {
    const firstRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: userEmail, locale: "en" },
    });

    expect(firstRequest.statusCode).toBe(202);
    expect(sentEmails).toHaveLength(1);

    const firstToken = extractTokenFromResetUrl(
      extractResetUrlFromEmail(sentEmails[0] as EmailMessage),
    );

    const secondRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: userEmail, locale: "en" },
    });

    expect(secondRequest.statusCode).toBe(202);
    expect(sentEmails).toHaveLength(2);

    const secondToken = extractTokenFromResetUrl(
      extractResetUrlFromEmail(sentEmails[1] as EmailMessage),
    );

    const firstResetAttempt = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: firstToken,
        newPassword: "new-password-strong-123",
      },
    });

    expect(firstResetAttempt.statusCode).toBe(409);
    expect(firstResetAttempt.json()).toMatchObject({
      error: {
        code: "PASSWORD_RESET_USED",
      },
    });

    const secondResetAttempt = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: secondToken,
        newPassword: "new-password-strong-123",
      },
    });

    expect(secondResetAttempt.statusCode).toBe(204);
  });

  it("consumes reset token on success and blocks token reuse", async () => {
    const forgotResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {
        email: userEmail,
        locale: "en",
      },
    });

    expect(forgotResponse.statusCode).toBe(202);
    expect(sentEmails).toHaveLength(1);

    const resetToken = extractTokenFromResetUrl(
      extractResetUrlFromEmail(sentEmails[0] as EmailMessage),
    );

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        newPassword: "brand-new-password-123",
      },
    });

    expect(resetResponse.statusCode).toBe(204);

    const tokenRows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));

    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]?.consumedAt).not.toBeNull();

    const userRows = await db.select().from(users).where(eq(users.id, userId));

    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.passwordHash).not.toBe("legacy-password-hash");

    const reuseResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        newPassword: "another-password-123",
      },
    });

    expect(reuseResponse.statusCode).toBe(409);
    expect(reuseResponse.json()).toMatchObject({
      error: {
        code: "PASSWORD_RESET_USED",
      },
    });
  });
});
