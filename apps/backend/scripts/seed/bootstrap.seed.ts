import { and, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { systemRuntimeState } from "#core/db/schema";

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
  });

  return true;
}
