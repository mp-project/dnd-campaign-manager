import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import {
  assertSafeTestDatabaseUrl,
  createDrizzleDb,
  createPgPool,
  createTransactionManager,
  resetTestDatabase,
  runDatabaseMigrations,
} from "#core/db/pool";
import {
  campaignRuntimeState,
  systemRuntimeState,
} from "#core/db/schema";
import {
  updateCampaignScopedRowWithOptimisticLock,
  VersionConflictError,
} from "#core/db/optimisticLock";

describe("core database", () => {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";
  const pool = createPgPool(databaseUrl);
  const db = createDrizzleDb(pool);
  const transactionManager = createTransactionManager(db);

  beforeAll(async () => {
    await runDatabaseMigrations(db);
  });

  beforeEach(async () => {
    await resetTestDatabase(pool, databaseUrl);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies base defaults and allows reusing unique keys after soft delete", async () => {
    const [inserted] = await db
      .insert(systemRuntimeState)
      .values({
        stateKey: "bootstrap",
        value: { ready: true },
      })
      .returning();

    if (!inserted) {
      throw new Error("Expected inserted system runtime state row");
    }

    expect(inserted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(inserted.version).toBe(1);
    expect(inserted.createdAt.toISOString().endsWith("Z")).toBe(true);
    expect(inserted.updatedAt.toISOString().endsWith("Z")).toBe(true);
    expect(inserted.deletedAt).toBeNull();

    await expect(
      db.insert(systemRuntimeState).values({
        stateKey: "bootstrap",
        value: { duplicate: true },
      }),
    ).rejects.toThrow();

    await db
      .update(systemRuntimeState)
      .set({ deletedAt: new Date() })
      .where(eq(systemRuntimeState.id, inserted.id));

    await expect(
      db.insert(systemRuntimeState).values({
        stateKey: "bootstrap",
        value: { duplicate: false },
      }),
    ).resolves.toBeDefined();
  });

  it("commits writes across repositories in one transaction", async () => {
    const campaignId = randomUUID();

    const systemRepo = {
      insertRuntimeState: async (stateKey: string, tx = db) => {
        await tx.insert(systemRuntimeState).values({
          stateKey,
          value: { source: "systemRepo" },
        });
      },
    };

    const campaignRepo = {
      insertRuntimeState: async (stateKey: string, tx = db) => {
        await tx.insert(campaignRuntimeState).values({
          campaignId,
          stateKey,
          value: { source: "campaignRepo" },
        });
      },
    };

    await transactionManager.inTransaction(async (tx) => {
      await systemRepo.insertRuntimeState("tx-commit-system", tx);
      await campaignRepo.insertRuntimeState("tx-commit-campaign", tx);
    });

    const systemRows = await db
      .select()
      .from(systemRuntimeState)
      .where(eq(systemRuntimeState.stateKey, "tx-commit-system"));
    const campaignRows = await db
      .select()
      .from(campaignRuntimeState)
      .where(
        and(
          eq(campaignRuntimeState.campaignId, campaignId),
          eq(campaignRuntimeState.stateKey, "tx-commit-campaign"),
        ),
      );

    expect(systemRows).toHaveLength(1);
    expect(campaignRows).toHaveLength(1);
  });

  it("rolls back all writes if one repository fails", async () => {
    const campaignId = randomUUID();

    await expect(
      transactionManager.inTransaction(async (tx) => {
        await tx.insert(systemRuntimeState).values({
          stateKey: "tx-rollback-system",
          value: { source: "systemRepo" },
        });

        await tx.insert(campaignRuntimeState).values({
          campaignId,
          stateKey: "tx-rollback-campaign",
          value: { source: "campaignRepo" },
        });

        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const systemRows = await db
      .select()
      .from(systemRuntimeState)
      .where(eq(systemRuntimeState.stateKey, "tx-rollback-system"));
    const campaignRows = await db
      .select()
      .from(campaignRuntimeState)
      .where(eq(campaignRuntimeState.stateKey, "tx-rollback-campaign"));

    expect(systemRows).toHaveLength(0);
    expect(campaignRows).toHaveLength(0);
  });

  it("guards updates with campaign/id/version/deletedAt for optimistic locking", async () => {
    const campaignId = randomUUID();

    const [row] = await db
      .insert(campaignRuntimeState)
      .values({
        campaignId,
        stateKey: "initiative-order",
        value: { round: 1 },
      })
      .returning();

    if (!row) {
      throw new Error("Expected inserted campaign runtime state row");
    }

    await updateCampaignScopedRowWithOptimisticLock(db, campaignRuntimeState, {
      id: row.id,
      campaignId,
      expectedVersion: 1,
      values: {
        value: { round: 2 },
      },
    });

    await expect(
      updateCampaignScopedRowWithOptimisticLock(db, campaignRuntimeState, {
        id: row.id,
        campaignId,
        expectedVersion: 1,
        values: {
          value: { round: 3 },
        },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const [updatedRow] = await db
      .select()
      .from(campaignRuntimeState)
      .where(eq(campaignRuntimeState.id, row.id));

    if (!updatedRow) {
      throw new Error("Expected updated campaign runtime state row");
    }

    expect(updatedRow.version).toBe(2);

    await db
      .update(campaignRuntimeState)
      .set({ deletedAt: new Date() })
      .where(eq(campaignRuntimeState.id, row.id));

    await expect(
      updateCampaignScopedRowWithOptimisticLock(db, campaignRuntimeState, {
        id: row.id,
        campaignId,
        expectedVersion: 2,
        values: {
          value: { round: 4 },
        },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("rejects obvious production database URLs for test reset", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgres://postgres:postgres@db.prod.internal:5432/dnd_campaign_manager",
      ),
    ).toThrow("Refusing test database operation for non-test DATABASE_URL.");

    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgres://postgres:postgres@127.0.0.1:5432/dnd_campaign_manager",
      ),
    ).toThrow("Refusing test database operation for non-test DATABASE_URL.");
  });

  it("accepts localhost test database URLs for test reset", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test",
      ),
    ).not.toThrow();
  });

  it("activeOnly helper filters rows with deletedAt IS NULL", async () => {
    const [activeRow] = await db
      .insert(systemRuntimeState)
      .values({
        stateKey: "active-state",
        value: { active: true },
      })
      .returning();

    if (!activeRow) {
      throw new Error("Expected inserted active system runtime state row");
    }

    await db.insert(systemRuntimeState).values({
      stateKey: "deleted-state",
      value: { active: false },
      deletedAt: new Date(),
    });

    const rows = await db
      .select()
      .from(systemRuntimeState)
      .where(and(eq(systemRuntimeState.id, activeRow.id), isNull(systemRuntimeState.deletedAt)));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.stateKey).toBe("active-state");
  });
});