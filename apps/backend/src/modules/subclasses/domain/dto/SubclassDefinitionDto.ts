import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import {
  CLASS_MAX_LEVEL,
  ClassChoiceSchema,
  FeatureGrantSchema,
  PREPARATION_MODES,
  ProgressionTrackSchema,
  RITUAL_MODES,
  ROUNDING_MODES,
  SpellcastingLevelSchema,
} from "#src/modules/classes/index";
import { ABILITIES, featureKeyDto } from "#src/modules/features/index";

/**
 * Schemas of the parts of a subclass definition. Grants, progression tracks and choices have the
 * shape of those of a class (`CLASS_CHOICE` bindings name a choice of the subclass). Rules across
 * parts are checked by `validateSubclassDefinition`, rules against the class by
 * `validateSubclassAgainstClass`, references to other assets by the service.
 */

/** Subclasses of classes without spellcasting may cast, mostly as third casters (Eldritch Knight). */
export const SUBCLASS_CASTING_TYPES = ["FULL", "HALF", "THIRD", "PACT"] as const;

/**
 * `ALWAYS_PREPARED`: the spell is prepared and doesn't count against the limit (domain and oath
 * spells); `ADDED_TO_LIST`: it joins the spell list the character chooses from (2014 expanded
 * spells of a warlock patron).
 */
export const SPELL_GRANT_MODES = ["ALWAYS_PREPARED", "ADDED_TO_LIST"] as const;

/** Maximum entries per list part; together with the level count this bounds a definition. */
export const SUBCLASS_PART_MAX_ITEMS = 50;

const classLevelDto = z.number().int().min(1).max(CLASS_MAX_LEVEL);
const displayOrderDto = z.number().int().min(0).max(1_000);

const ascendingLevels = (items: readonly { level: number }[]) =>
  items.every((item, index) => index === 0 || item.level > (items[index - 1]?.level ?? 0));

/** The grants of one class level; only levels at which the subclass adds something. */
export const SubclassLevelSchema = z.strictObject({
  level: classLevelDto,
  featureGrants: z.array(FeatureGrantSchema).max(30).default([]),
});

export const SubclassSpellcastingSchema = z
  .strictObject({
    castingType: z.enum(SUBCLASS_CASTING_TYPES),
    spellcastingAbility: z.enum(ABILITIES),
    /** Class level at which the subclass starts casting; at or above the selection level. */
    unlockLevel: classLevelDto,
    preparationMode: z.enum(PREPARATION_MODES).exclude(["NONE"]),
    spellListAssetId: uuidDto.nullable().default(null),
    ritualMode: z.enum(RITUAL_MODES).nullable().default(null),
    /** Share of the class level that counts for multiclass spell slots, e.g. 1/3. */
    multiclassNumerator: z.number().int().min(1).max(10).nullable().default(null),
    multiclassDenominator: z.number().int().min(1).max(10).nullable().default(null),
    multiclassRounding: z.enum(ROUNDING_MODES).nullable().default(null),
    levels: z.array(SpellcastingLevelSchema).max(CLASS_MAX_LEVEL).default([]),
  })
  .superRefine((profile, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const hasFraction =
      profile.multiclassNumerator !== null || profile.multiclassDenominator !== null;

    if ((profile.multiclassNumerator === null) !== (profile.multiclassDenominator === null)) {
      issue(["multiclassNumerator"], "The multiclass share needs numerator and denominator");
    }

    if (profile.castingType === "PACT") {
      if (hasFraction || profile.multiclassRounding !== null) {
        issue(["multiclassNumerator"], "Pact magic does not count towards multiclass spell slots");
      }
    } else if (!hasFraction || profile.multiclassRounding === null) {
      issue(["multiclassNumerator"], "Casters with spell slots need a multiclass share and rounding");
    } else if (
      profile.multiclassNumerator !== null &&
      profile.multiclassDenominator !== null &&
      profile.multiclassNumerator > profile.multiclassDenominator
    ) {
      issue(["multiclassNumerator"], "The multiclass share cannot exceed 1");
    }

    if (!ascendingLevels(profile.levels)) {
      issue(["levels"], "Levels must be unique and ascending");
    }

    profile.levels.forEach((entry, index) => {
      if (entry.level < profile.unlockLevel) {
        issue(["levels", index], "Spellcasting starts at the unlock level");
      }

      if (profile.castingType === "PACT" && entry.spellSlots.length > 0) {
        issue(["levels", index, "spellSlots"], "Pact casters use pact slots");
      }

      if (profile.castingType !== "PACT" && entry.pactSlots !== null) {
        issue(["levels", index, "pactSlots"], "Only pact casters have pact slots");
      }
    });
  });

/** A spell the subclass gives at a class level: domain, oath, circle or patron spells. */
export const SpellGrantSchema = z.strictObject({
  key: featureKeyDto,
  level: classLevelDto,
  spellAssetId: uuidDto,
  mode: z.enum(SPELL_GRANT_MODES).default("ALWAYS_PREPARED"),
  displayOrder: displayOrderDto,
});

export const SubclassDefinitionSchema = z.strictObject({
  levels: z.array(SubclassLevelSchema).max(CLASS_MAX_LEVEL),
  progressionTracks: z.array(ProgressionTrackSchema).max(SUBCLASS_PART_MAX_ITEMS),
  choices: z.array(ClassChoiceSchema).max(SUBCLASS_PART_MAX_ITEMS * 2),
  spellcasting: SubclassSpellcastingSchema.nullable(),
  spellGrants: z.array(SpellGrantSchema).max(SUBCLASS_PART_MAX_ITEMS * 2),
});

export type SubclassLevel = z.infer<typeof SubclassLevelSchema>;
export type SubclassSpellcasting = z.infer<typeof SubclassSpellcastingSchema>;
export type SpellGrant = z.infer<typeof SpellGrantSchema>;
export type SubclassDefinition = z.infer<typeof SubclassDefinitionSchema>;
