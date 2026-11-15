import { eq, isNull, and, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  rulesetLevelProgressions,
  rulesets,
  rulesetSpellSlotProgressions,
  systemRuntimeState,
} from "#core/db/schema";

import {
  buildLevelProgressions,
  buildSpellSlotProgressions,
  DEFAULT_RULESETS,
  SYSTEM_ACTOR_ID,
} from "./DefaultRulesetData.js";

/** Raise when DEFAULT_RULESETS gains a ruleset, so existing installations get it at the next start. */
export const DEFAULT_RULESETS_VERSION = 1;

const STATE_KEY = "ruleset.defaults";

/**
 * Creates the default rulesets (D&D 5E 2014 and 2024 with level and spell slot progressions), so a
 * campaign can be created without any manual step. Runs at start and from the seed script:
 * - once per `DEFAULT_RULESETS_VERSION` (stored in `system_runtime_state`), so a default ruleset an
 *   administrator deleted doesn't come back;
 * - only codes that never existed (deleted rows included) are created;
 * - an advisory lock keeps several app instances from doing it at the same time.
 * Writes the tracked `rulesets` table directly, like a seed: there is no actor and nothing to undo.
 * Returns how many rulesets were created.
 */
export async function ensureDefaultRulesets(db: AppDatabase): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${STATE_KEY}))`);

    const [state] = await tx
      .select({ id: systemRuntimeState.id, value: systemRuntimeState.value })
      .from(systemRuntimeState)
      .where(and(eq(systemRuntimeState.stateKey, STATE_KEY), isNull(systemRuntimeState.deletedAt)));
    const version = (state?.value as { version?: unknown } | undefined)?.version;
    if (typeof version === "number" && version >= DEFAULT_RULESETS_VERSION) {
      return 0;
    }

    let created = 0;
    for (const ruleset of DEFAULT_RULESETS) {
      const [existing] = await tx
        .select({ id: rulesets.id })
        .from(rulesets)
        .where(eq(rulesets.code, ruleset.code))
        .limit(1);
      if (existing) continue;

      const [inserted] = await tx
        .insert(rulesets)
        .values({ ...ruleset, status: "ACTIVE", createdBy: SYSTEM_ACTOR_ID, updatedBy: SYSTEM_ACTOR_ID })
        .returning({ id: rulesets.id });
      if (!inserted) throw new Error(`Failed to insert ruleset '${ruleset.code}'`);

      await tx.insert(rulesetLevelProgressions).values(
        buildLevelProgressions().map((level) => ({
          rulesetId: inserted.id,
          ...level,
          createdBy: SYSTEM_ACTOR_ID,
          updatedBy: SYSTEM_ACTOR_ID,
        })),
      );
      await tx.insert(rulesetSpellSlotProgressions).values(
        buildSpellSlotProgressions().map((slot) => ({
          rulesetId: inserted.id,
          ...slot,
          createdBy: SYSTEM_ACTOR_ID,
          updatedBy: SYSTEM_ACTOR_ID,
        })),
      );
      created += 1;
    }

    const value = { version: DEFAULT_RULESETS_VERSION };
    if (state) {
      await tx.update(systemRuntimeState).set({ value, updatedAt: new Date() }).where(eq(systemRuntimeState.id, state.id));
    } else {
      await tx.insert(systemRuntimeState).values({ stateKey: STATE_KEY, value });
    }

    return created;
  });
}
