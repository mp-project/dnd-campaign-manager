import { and, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { systemRuntimeState } from "#core/db/schema";

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function seedBootstrapState(db: AppDatabase): Promise<boolean> {
  const existingBootstrapState = await db
    .select({ id: systemRuntimeState.id })
    .from(systemRuntimeState)
    .where(
      and(
        eq(systemRuntimeState.stateKey, "bootstrap"),
        isNull(systemRuntimeState.deletedAt),
      ),
    )
    .limit(1);

  if (existingBootstrapState.length > 0) {
    return false;
  }

  await db.insert(systemRuntimeState).values({
    stateKey: "bootstrap",
    value: {
      seededAt: new Date().toISOString(),
    },
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
  });

  return true;
}
