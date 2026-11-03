import argon2 from "argon2";
import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { refreshTokens, users } from "#core/db/schema";
import { sha256 } from "#src/modules/auth/utils/crypto";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const EMAIL = "refresh@example.test";
const PASSWORD = "super-secure-password";

describe("auth refresh token rotation", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app } = buildTestApp();

  function refresh(refreshToken: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
  }

  function tokenOf(response: { cookies: Array<{ name: string; value: string }> }): string {
    return response.cookies.find((cookie) => cookie.name === "refresh_token")!.value;
  }

  async function login(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);

    return tokenOf(response);
  }

  async function endGracePeriod(token: string) {
    await db
      .update(refreshTokens)
      .set({ rotatedAt: new Date(Date.now() - 60_000) })
      .where(eq(refreshTokens.tokenHash, sha256(token)));
  }

  beforeEach(async () => {
    await db.insert(users).values({
      email: EMAIL,
      passwordHash: await argon2.hash(PASSWORD),
      displayName: "Player",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const first = await login();
    const second = tokenOf(await refresh(first));
    await endGracePeriod(first);

    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(401);
  });

  it("keeps other sessions of the user when one family is revoked", async () => {
    const first = await login();
    const otherDevice = await login();
    await refresh(first);
    await endGracePeriod(first);
    await refresh(first);

    expect((await refresh(otherDevice)).statusCode).toBe(200);
  });

  it("tolerates a reused token right after its rotation", async () => {
    const first = await login();
    const second = tokenOf(await refresh(first));
    const reused = await refresh(first);

    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ error: { code: "SESSION_ALREADY_ROTATED" } });
    expect((await refresh(second)).statusCode).toBe(200);
  });

  it("lets only one of two parallel requests rotate a token", async () => {
    const first = await login();
    const responses = await Promise.all([refresh(first), refresh(first)]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  });

  it("persists the revocation of an expired token", async () => {
    const first = await login();
    const tokenHash = sha256(first);
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    expect((await refresh(first)).statusCode).toBe(401);

    const [row] = await db
      .select({ revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    expect(row?.revokedAt).not.toBeNull();
  });
});
