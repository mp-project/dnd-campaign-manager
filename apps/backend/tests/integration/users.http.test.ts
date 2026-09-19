import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { userSettings, users } from "#core/db/schema";
import type { SystemRole } from "#core/permissions/roles";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

type SeedUserInput = {
  id: string;
  email: string;
  displayName: string;
  systemRole: SystemRole;
  status?: "ACTIVE" | "LOCKED" | "DISABLED";
  emailVerifiedAt?: Date | null;
};

describe("users HTTP routes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  async function seedUser(input: SeedUserInput) {
    await db.insert(users).values({
      id: input.id,
      email: input.email,
      passwordHash: "test-password-hash",
      displayName: input.displayName,
      systemRole: input.systemRole,
      status: input.status ?? "ACTIVE",
      emailVerifiedAt: input.emailVerifiedAt ?? null,
    });
  }

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns 401 for unauthenticated me requests", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns profile and creates default settings on first read", async () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await seedUser({
      id: userId,
      email: "player@example.test",
      displayName: "Player One",
      systemRole: "USER",
    });

    const response = await injectAs(
      { actorId: userId, systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/me",
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: userId,
      email: "player@example.test",
      emailVerificationRequiredCode: "EMAIL_NOT_VERIFIED",
      settings: {
        locale: "de",
        timezone: "UTC",
        theme: "SYSTEM",
      },
    });

    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    expect(settingsRows).toHaveLength(1);
  });

  it("normalizes updated email and resets verification", async () => {
    const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await seedUser({
      id: userId,
      email: "old@example.test",
      displayName: "Player Two",
      systemRole: "USER",
      emailVerifiedAt: new Date(),
    });

    const response = await injectAs(
      { actorId: userId, systemRole: "USER" },
      {
        method: "PATCH",
        url: "/api/v1/me",
        payload: {
          email: "New.Email@Example.Test",
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe("new.email@example.test");

    const rows = await db.select().from(users).where(eq(users.id, userId));
    expect(rows[0]?.email).toBe("new.email@example.test");
    expect(rows[0]?.emailVerifiedAt).toBeNull();
  });

  it("forbids non-admin access to admin user listing", async () => {
    const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await seedUser({
      id: userId,
      email: "viewer@example.test",
      displayName: "Viewer",
      systemRole: "USER",
    });

    const response = await injectAs(
      { actorId: userId, systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/admin/users",
      },
    );

    expect(response.statusCode).toBe(403);
  });

  it("enforces admin/super-admin management boundaries and self-demotion guard", async () => {
    const superAdmin = "11111111-1111-4111-8111-111111111111";
    const adminA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const adminB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const managedUser = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    await seedUser({
      id: superAdmin,
      email: "super.admin@example.test",
      displayName: "Super Admin",
      systemRole: "SUPER_ADMIN",
    });
    await seedUser({
      id: adminA,
      email: "admin.a@example.test",
      displayName: "Admin A",
      systemRole: "ADMIN",
    });
    await seedUser({
      id: adminB,
      email: "admin.b@example.test",
      displayName: "Admin B",
      systemRole: "ADMIN",
    });
    await seedUser({
      id: managedUser,
      email: "user@example.test",
      displayName: "Managed User",
      systemRole: "USER",
    });

    const listResponse = await injectAs(
      { actorId: adminA, systemRole: "ADMIN" },
      {
        method: "GET",
        url: "/api/v1/admin/users?limit=20",
      },
    );

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.length).toBeGreaterThanOrEqual(3);

    const managedRows = await db
      .select()
      .from(users)
      .where(eq(users.id, managedUser));
    const managedVersion = managedRows[0]?.version ?? 1;

    const updateResponse = await injectAs(
      { actorId: adminA, systemRole: "ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/admin/users/${managedUser}`,
        payload: {
          expectedVersion: managedVersion,
          status: "LOCKED",
        },
      },
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().status).toBe("LOCKED");

    const promoteByAdmin = await injectAs(
      { actorId: adminA, systemRole: "ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/admin/users/${managedUser}`,
        payload: {
          expectedVersion: updateResponse.json().version,
          systemRole: "ADMIN",
        },
      },
    );

    expect(promoteByAdmin.statusCode).toBe(403);

    const disableAdminB = await injectAs(
      { actorId: adminA, systemRole: "ADMIN" },
      {
        method: "DELETE",
        url: `/api/v1/admin/users/${adminB}`,
      },
    );

    expect(disableAdminB.statusCode).toBe(403);

    const superAdminDisablesAdminB = await injectAs(
      { actorId: superAdmin, systemRole: "SUPER_ADMIN" },
      {
        method: "DELETE",
        url: `/api/v1/admin/users/${adminB}`,
      },
    );

    expect(superAdminDisablesAdminB.statusCode).toBe(204);

    const superAdminSelfDemotion = await injectAs(
      { actorId: superAdmin, systemRole: "SUPER_ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/admin/users/${superAdmin}`,
        payload: {
          expectedVersion: 1,
          systemRole: "ADMIN",
        },
      },
    );

    expect(superAdminSelfDemotion.statusCode).toBe(409);

    const adminSelfDemotion = await injectAs(
      { actorId: adminA, systemRole: "ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/admin/users/${adminA}`,
        payload: {
          expectedVersion: 1,
          systemRole: "USER",
        },
      },
    );

    expect(adminSelfDemotion.statusCode).toBe(409);
  });
});
