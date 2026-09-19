import { and, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  rulesetLevelProgressions,
  rulesets,
  rulesetSpellSlotProgressions,
} from "#core/db/schema";
import {
  buildLevelProgressions,
  buildSpellSlotProgressions,
  rulesetSeedRows,
  seedActorId,
} from "./ruleset.seed-data.js";

export async function seedRulesets(db: AppDatabase): Promise<number> {
  let createdCount = 0;
  const levelProgressions = buildLevelProgressions();
  const spellSlotProgressions = buildSpellSlotProgressions();

  for (const rulesetSeed of rulesetSeedRows) {
    const existing = await db
      .select({ id: rulesets.id })
      .from(rulesets)
      .where(and(eq(rulesets.code, rulesetSeed.code), isNull(rulesets.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const [insertedRuleset] = await db
      .insert(rulesets)
      .values({
        code: rulesetSeed.code,
        name: rulesetSeed.name,
        description: rulesetSeed.description,
        status: "ACTIVE",
        editionYear: rulesetSeed.editionYear,
        sourceReference: rulesetSeed.sourceReference,
        licenseCode: rulesetSeed.licenseCode,
        attribution: rulesetSeed.attribution,
        createdBy: seedActorId,
        updatedBy: seedActorId,
      })
      .returning({ id: rulesets.id });

    if (!insertedRuleset) {
      throw new Error(`Failed to insert ruleset '${rulesetSeed.code}'`);
    }

    await db.insert(rulesetLevelProgressions).values(
      levelProgressions.map((item) => ({
        rulesetId: insertedRuleset.id,
        characterLevel: item.characterLevel,
        proficiencyBonus: item.proficiencyBonus,
        experienceThreshold: item.experienceThreshold,
        createdBy: seedActorId,
        updatedBy: seedActorId,
      })),
    );

    await db.insert(rulesetSpellSlotProgressions).values(
      spellSlotProgressions.map((item) => ({
        rulesetId: insertedRuleset.id,
        casterLevel: item.casterLevel,
        slotLevel: item.slotLevel,
        slotCount: item.slotCount,
        createdBy: seedActorId,
        updatedBy: seedActorId,
      })),
    );

    createdCount += 1;
  }

  return createdCount;
}
