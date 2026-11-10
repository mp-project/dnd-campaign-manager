import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { campaignFactValues } from "#core/rules/campaignFacts";
import type { ComputedStatBlock } from "#src/modules/actors/domain/ActorStatBlock";
import {
  ATTACK_TYPES,
  SKILL_CODES,
  SKILL_PROFICIENCY_LEVELS,
  TRAIT_KINDS,
} from "#src/modules/actors/domain/dto/ActorPartsDto";
import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";
import type { ActorWithAsset } from "#src/modules/actors/domain/repository/ActorsRepository";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { ABILITIES } from "#src/modules/features/index";

const sourceDto = z.enum(["SET", "OVERRIDE", "CALCULATED"]);
const abilityDto = z.enum(ABILITIES);
/** Null when a value it needs is missing, e.g. the proficiency bonus; `reasons` says which. */
const bonusDto = z.number().int().nullable();

const ActorShape = ActorBaseSchema.shape;

/**
 * The stat block of an actor, computed on every read from its base values and its items; nothing of
 * it is stored. Only for GMs and editors for now; players get their own character's with the
 * character modules.
 */
export const ResponseActorStatBlockSchema = z.strictObject({
  actorId: uuidDto,
  assetId: uuidDto,
  name: ActorShape.name,
  displayName: ActorShape.displayName,
  category: ActorShape.category,
  size: ActorShape.size,
  creatureType: ActorShape.creatureType,
  creatureSubtype: ActorShape.creatureSubtype,
  alignment: ActorShape.alignment,
  proficiencyBonus: z.strictObject({ value: z.number().int().nullable(), source: sourceDto }),
  abilities: z.array(
    z.strictObject({
      ability: abilityDto,
      baseScore: z.number().int(),
      score: z.number().int(),
      scoreSource: sourceDto,
      modifier: z.number().int(),
      savingThrow: z.strictObject({ proficient: z.boolean(), bonus: bonusDto, source: sourceDto }),
      overrideReason: z.string().nullable(),
    }),
  ),
  skills: z.array(
    z.strictObject({
      skill: z.enum(SKILL_CODES),
      ability: abilityDto,
      proficiency: z.enum(SKILL_PROFICIENCY_LEVELS),
      bonus: bonusDto,
      source: sourceDto,
      overrideReason: z.string().nullable(),
    }),
  ),
  passivePerception: z.number().int().nullable(),
  armorClass: z.strictObject({
    value: z.number().int(),
    source: sourceDto,
    note: z.string().nullable(),
    base: z.number().int().nullable(),
    armorInstanceId: uuidDto.nullable(),
    shieldBonus: z.number().int(),
    modifiers: z.number(),
  }),
  hitPoints: z.strictObject({
    maximum: z.number().int().nullable(),
    formula: z.string().nullable(),
    source: sourceDto,
  }),
  initiative: z.strictObject({ bonus: z.number().int(), source: sourceDto }),
  speeds: ActorShape.speeds,
  senses: ActorShape.senses,
  languages: ActorShape.languages,
  defenses: ActorShape.defenses,
  proficiencies: ActorShape.proficiencies,
  traits: z.array(
    ActorShape.traits.element.extend({ descriptionHtml: z.string() }),
  ),
  attacks: z.array(
    z.strictObject({
      source: z.enum(["TRAIT", "ITEM"]),
      key: z.string().nullable(),
      instanceId: uuidDto.nullable(),
      name: z.string(),
      kind: z.enum(TRAIT_KINDS),
      attackType: z.enum(ATTACK_TYPES).nullable(),
      attackBonus: bonusDto,
      reachFeet: z.number().int().nullable(),
      rangeNormalFeet: z.number().int().nullable(),
      rangeLongFeet: z.number().int().nullable(),
      damage: z.array(
        z.strictObject({
          diceCount: z.number().int().nullable(),
          diceFaces: z.number().int().nullable(),
          bonus: z.number().int().nullable(),
          damageType: z.string().nullable(),
        }),
      ),
      reasons: z.array(z.string()),
    }),
  ),
  items: z.array(
    z.strictObject({
      instanceId: uuidDto,
      itemAssetId: uuidDto,
      name: z.string(),
      quantity: z.number().int(),
      equipped: z.boolean(),
      attuned: z.boolean(),
      functional: z.boolean(),
    }),
  ),
  itemEffects: z.strictObject({
    effects: z.array(
      z.strictObject({
        instanceId: uuidDto,
        key: z.string(),
        label: z.string().nullable(),
        activation: z.string(),
        applies: z.enum(campaignFactValues),
        payload: z.record(z.string(), z.unknown()),
      }),
    ),
    modifiers: z.record(z.string(), z.number()),
    baseValues: z.record(z.string(), z.number()),
    grants: z.array(z.strictObject({ instanceId: uuidDto, grantType: z.string(), value: z.string() })),
    features: z.array(
      z.strictObject({ instanceId: uuidDto, featureAssetId: uuidDto, operation: z.string() }),
    ),
    spells: z.array(
      z.strictObject({
        instanceId: uuidDto,
        spellAssetId: uuidDto,
        castAtLevel: z.number().int().nullable(),
        available: z.boolean(),
      }),
    ),
  }),
  reasons: z.array(z.string()),
});

export type ResponseActorStatBlockDto = z.infer<typeof ResponseActorStatBlockSchema>;

export function toActorStatBlockResponse(
  { actor, asset }: ActorWithAsset,
  computed: ComputedStatBlock,
): ResponseActorStatBlockDto {
  return {
    actorId: actor.id,
    assetId: asset.id,
    name: asset.title,
    displayName: actor.displayName,
    category: actor.category,
    size: actor.size,
    creatureType: actor.creatureType,
    creatureSubtype: actor.creatureSubtype,
    alignment: actor.alignment,
    ...computed,
    traits: computed.traits.map((trait) => ({
      ...trait,
      descriptionHtml: renderSafeMarkdown("MARKDOWN", trait.description),
    })),
    itemEffects: {
      ...computed.itemEffects,
      effects: computed.itemEffects.effects.map((effect) => ({
        ...effect,
        payload: effect.payload as Record<string, unknown>,
      })),
    },
  } as ResponseActorStatBlockDto;
}
