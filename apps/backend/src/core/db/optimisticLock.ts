import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import type { AppDatabase } from "#core/db/pool";
import { AppError } from "#core/error/AppError";

type CampaignScopedVersionedTable = AnyPgTable & {
  id: AnyPgColumn;
  campaignId: AnyPgColumn;
  version: AnyPgColumn;
  deletedAt: AnyPgColumn;
  updatedAt: AnyPgColumn;
};

/**
 * Raised when a versioned update cannot be applied due to concurrent modifications.
 */
export class VersionConflictError extends AppError<"VERSION_CONFLICT"> {
  constructor(message: string) {
    super("VERSION_CONFLICT", message, { statusCode: 412 });
    this.name = "VersionConflictError";
  }
}

type UpdateCampaignScopedRowParams = {
  id: string;
  campaignId: string;
  expectedVersion: number;
  values: Record<string, unknown>;
};

/**
 * Updates a campaign-scoped row with optimistic locking on the version column.
 *
 * @param db Application database instance.
 * @param table Campaign-scoped versioned table descriptor.
 * @param params Row id, campaign id, expected version and patch values.
 * @returns Promise resolved when exactly one row was updated.
 */
export async function updateCampaignScopedRowWithOptimisticLock(
  db: AppDatabase,
  table: CampaignScopedVersionedTable,
  params: UpdateCampaignScopedRowParams,
): Promise<void> {
  const [updated] = await db
    .update(table)
    .set({
      ...params.values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`now()`,
    } as Record<string, unknown>)
    .where(
      and(
        eq(table.id as never, params.id),
        eq(table.campaignId as never, params.campaignId),
        eq(table.version as never, params.expectedVersion),
        isNull(table.deletedAt as never),
      ),
    )
    .returning({ id: table.id as never });

  if (!updated) {
    throw new VersionConflictError(
      "Optimistic lock conflict for campaign-scoped row",
    );
  }
}