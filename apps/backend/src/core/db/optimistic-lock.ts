import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import type { AppDatabase } from "./pool.js";

type CampaignScopedVersionedTable = AnyPgTable & {
  id: AnyPgColumn;
  campaignId: AnyPgColumn;
  version: AnyPgColumn;
  deletedAt: AnyPgColumn;
  updatedAt: AnyPgColumn;
};

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "VersionConflictError";
  }
}

type UpdateCampaignScopedRowParams = {
  id: string;
  campaignId: string;
  expectedVersion: number;
  values: Record<string, unknown>;
};

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