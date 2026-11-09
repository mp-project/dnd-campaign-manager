import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { campaignFactValues } from "#core/rules/campaignFacts";
import { ADVANTAGE_MODES } from "#core/rules/contracts";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import type { AssetRow } from "#src/modules/assets/index";
import { ResolvedPayloadSchema, ResponseResolvedFeatureSchema } from "#src/modules/features/index";
import {
  ItemBaseSchema,
  ItemInstanceBaseSchema,
  ItemKnowledgeBaseSchema,
} from "#src/modules/items/domain/dto/BaseItemDto";
import {
  GRANT_OPERATIONS,
  ITEM_ACTIVATIONS,
  type ItemDefinitionParts,
  ItemFeatureGrantViewSchema,
  PASSIVE_ACTIVATIONS,
} from "#src/modules/items/domain/dto/ItemDefinitionDto";
import { toPlayerParts } from "#src/modules/items/domain/ItemDefinition";
import type {
  ItemInstancePage,
  ItemInstanceRow,
  ItemKnowledgeRow,
  ItemPage,
  ItemRecord,
  ItemRow,
  ItemWithAsset,
} from "#src/modules/items/domain/repository/ItemsRepository";
import { readItemDefinition } from "#src/modules/items/history/TrackedItem";
import type { EffectiveKnowledge } from "#src/modules/items/service/ItemInstancesService";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

const B = ItemBaseSchema.shape;

const assetResponseShape = {
  ...baseEntityResponseDto.shape,
  assetVersion: z.number().int().positive(),
  ...ItemBaseSchema.pick({
    assetId: true,
    campaignId: true,
    scope: true,
    name: true,
    summary: true,
    status: true,
    sourceReference: true,
    rulesetPolicy: true,
    rulesetIds: true,
    assetFamilyId: true,
    releasedToPlayers: true,
  }).shape,
};

/** What everybody who may see the item sees of its typed columns. */
const coreShape = ItemBaseSchema.omit({
  id: true,
  assetId: true,
  campaignId: true,
  scope: true,
  name: true,
  summary: true,
  status: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  gmNotes: true,
  forkedFromAssetId: true,
}).shape;

const renderedShape = {
  descriptionHtml: htmlDto.nullable(),
  /** Whether the item may be newly used: only active items. */
  selectable: z.boolean(),
};

/**
 * View for those who may change the item. `version` and the audit fields belong to the item,
 * `assetVersion` to its asset; changes send both back.
 */
export const ResponseItemFullSchema = z
  .strictObject(assetResponseShape)
  .extend(coreShape)
  .extend({
    view: z.literal("FULL"),
    gmNotes: B.gmNotes,
    gmNotesHtml: htmlDto.nullable(),
    forkedFromAssetId: B.forkedFromAssetId,
    ...renderedShape,
  });

export const ResponseUpdateItemSchema = ResponseItemFullSchema.extend({ merged: z.array(z.string()) });

/**
 * View for players. Strict, so nothing else leaves the server: no GM notes, audit data, rulesets,
 * release flag or origin, and no grants or spells of assets the player may not see.
 */
export const ResponseItemPlayerSchema = ItemBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
})
  .extend(coreShape)
  .extend({
    view: z.literal("PLAYER"),
    featureGrants: z.array(ItemFeatureGrantViewSchema),
    ...renderedShape,
  });

export const ResponseItemSchema = z.discriminatedUnion("view", [ResponseItemFullSchema, ResponseItemPlayerSchema]);

const listItemCore = {
  view: true,
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  category: true,
  costAmount: true,
  costCurrency: true,
  weight: true,
  isMagical: true,
  isStackable: true,
  rarity: true,
  attunementMode: true,
  weaponCategory: true,
  armorCategory: true,
  selectable: true,
} as const;

/** List entry for GMs and editors: everything to sort and pick an item, but no details. */
export const ResponseItemListItemFullSchema = ResponseItemFullSchema.pick({
  ...listItemCore,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  assetVersion: true,
  campaignId: true,
  status: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
});

export const ResponseItemListItemPlayerSchema = ResponseItemPlayerSchema.pick(listItemCore);

export const ResponseItemListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseItemListItemFullSchema, ResponseItemListItemPlayerSchema]),
);

export const ResponseValidationSchema = z.strictObject({
  id: uuidDto,
  valid: z.boolean(),
  issues: z.array(
    z.strictObject({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
  ),
});

const sectionHeader = { itemId: uuidDto, assetId: uuidDto, view: z.enum(["FULL", "PLAYER"]) };

/** What the item does: effects, granted features and spells. */
export const ResponseItemEffectsSchema = z.strictObject({
  ...sectionHeader,
  attunementMode: B.attunementMode,
  chargesMaximum: B.chargesMaximum,
  recharge: B.recharge,
  effects: B.effects,
  featureGrants: z.array(ItemFeatureGrantViewSchema),
  spells: B.spells,
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const nullableNumber = z.number().nullable();

/** What an item gives an actor in a state; nothing is stored or spent. */
export const ResponseItemResolutionSchema = z.strictObject({
  ...sectionHeader,
  /** Set when an instance was resolved. */
  instanceId: uuidDto.nullable(),
  state: z.strictObject({
    carried: z.boolean(),
    equipped: z.boolean(),
    attuned: z.boolean(),
    /** False while the item requires attunement the actor lacks, or isn't carried. */
    functional: z.boolean(),
    chargesCurrent: nullableNumber,
    chargesMaximum: nullableNumber,
  }),
  weapon: z
    .strictObject({
      weaponCategory: B.weaponCategory,
      combatType: B.weaponCombatType,
      properties: B.weaponProperties,
      mastery: B.masteryProperty,
      attackAbility: z.enum(["str", "dex"]).nullable(),
      abilityModifier: nullableNumber,
      proficient: z.boolean().nullable(),
      proficiencyBonus: nullableNumber,
      magicBonus: z.number(),
      /** Ability modifier + proficiency bonus (if proficient) + magic bonus. */
      attackBonus: nullableNumber,
      damage: z.strictObject({
        dice: z.strictObject({ count: z.number().int(), faces: z.number().int() }).nullable(),
        fixed: nullableNumber,
        /** Ability modifier + magic bonus, added to the dice. */
        bonus: nullableNumber,
        damageType: B.damageType,
        twoHanded: z.boolean(),
      }),
      range: z.strictObject({ normal: z.number().int(), long: z.number().int() }).nullable(),
      reasons: z.array(z.string()),
    })
    .nullable(),
  armor: z
    .strictObject({
      armorCategory: B.armorCategory,
      baseArmorClass: z.number().int(),
      dexterityMode: B.dexterityMode,
      dexterityCap: B.dexterityCap,
      dexterityBonus: nullableNumber,
      magicBonus: z.number(),
      /** Armor: the armor class while worn. Null for shields. */
      armorClass: nullableNumber,
      /** Shields: what they add to the armor class. Null for armor. */
      armorClassBonus: nullableNumber,
      strengthRequirement: nullableNumber,
      meetsStrengthRequirement: z.boolean().nullable(),
      stealthDisadvantage: z.boolean(),
      proficient: z.boolean().nullable(),
      /** Worn and working. */
      active: z.boolean(),
      reasons: z.array(z.string()),
    })
    .nullable(),
  effects: z.array(
    z.strictObject({
      key: z.string(),
      label: z.string().nullable(),
      activation: z.enum(ITEM_ACTIVATIONS),
      active: z.boolean(),
      applies: z.enum(campaignFactValues),
      chargeCost: z.number().int(),
      payload: ResolvedPayloadSchema,
      reasons: z.array(z.string()),
    }),
  ),
  /** Passive effects that are active and apply, added up (modifiers summed, highest base value). */
  totals: z.strictObject({
    modifiers: z.record(z.string(), z.number()),
    baseValues: z.record(z.string(), z.number()),
    grants: z.array(z.strictObject({ grantType: z.string(), value: z.string() })),
    advantages: z.array(z.strictObject({ mode: z.enum(ADVANTAGE_MODES), on: z.string() })),
  }),
  spells: z.array(
    z.strictObject({
      key: z.string(),
      spellAssetId: uuidDto,
      chargeCost: z.number().int(),
      castAtLevel: nullableNumber,
      saveDc: nullableNumber,
      attackBonus: nullableNumber,
      activation: z.enum(PASSIVE_ACTIVATIONS),
      active: z.boolean(),
      available: z.boolean(),
    }),
  ),
  featureGrants: z.array(
    z.strictObject({
      key: z.string(),
      featureAssetId: uuidDto,
      operation: z.enum(GRANT_OPERATIONS),
      targetFeatureAssetId: uuidDto.nullable(),
      activation: z.enum(PASSIVE_ACTIVATIONS),
      active: z.boolean(),
      resolved: ResponseResolvedFeatureSchema.nullable(),
    }),
  ),
  reasons: z.array(z.string()),
});

export type ResponseItemFullDto = z.infer<typeof ResponseItemFullSchema>;
export type ResponseUpdateItemDto = z.infer<typeof ResponseUpdateItemSchema>;
export type ResponseItemPlayerDto = z.infer<typeof ResponseItemPlayerSchema>;
export type ResponseItemDto = z.infer<typeof ResponseItemSchema>;
export type ResponseItemListDto = z.infer<typeof ResponseItemListSchema>;
export type ResponseValidationDto = z.infer<typeof ResponseValidationSchema>;
export type ResponseItemEffectsDto = z.infer<typeof ResponseItemEffectsSchema>;
export type ResponseItemResolutionDto = z.infer<typeof ResponseItemResolutionSchema>;

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

const I = ItemInstanceBaseSchema.shape;

export const ResponseItemKnowledgeSchema = z
  .strictObject(baseEntityResponseDto.shape)
  .extend(ItemKnowledgeBaseSchema.omit({ id: true, campaignId: true }).shape);

/** The current definition, as far as an instance list needs it. */
const definitionSummaryDto = z.strictObject({
  id: uuidDto,
  assetId: uuidDto,
  scope: B.scope,
  status: B.status,
  name: B.name,
  code: B.code,
  category: B.category,
  isMagical: B.isMagical,
  isStackable: B.isStackable,
  rarity: B.rarity,
  attunementMode: B.attunementMode,
  chargesMaximum: B.chargesMaximum,
  weight: B.weight,
});

/** View for those who may change the instance: state, GM notes, definition and all knowledge. */
export const ResponseItemInstanceFullSchema = z
  .strictObject(baseEntityResponseDto.shape)
  .extend(ItemInstanceBaseSchema.omit({ id: true }).shape)
  .extend({
    view: z.literal("FULL"),
    /** The custom name, otherwise the name of the definition. */
    name: z.string(),
    notesHtml: htmlDto.nullable(),
    item: definitionSummaryDto,
    knowledge: z.array(ResponseItemKnowledgeSchema),
  });

/**
 * How a seen but unidentified item looks: what anybody can tell by looking at it (category, weight,
 * the plain weapon or armor values), nothing magical.
 */
export const ResponseItemAppearanceSchema = z.strictObject({
  category: B.category,
  weight: B.weight,
  weaponCategory: B.weaponCategory,
  weaponCombatType: B.weaponCombatType,
  damageDiceCount: B.damageDiceCount,
  damageDiceFaces: B.damageDiceFaces,
  damageFixed: B.damageFixed,
  damageType: B.damageType,
  versatileDiceFaces: B.versatileDiceFaces,
  weaponProperties: B.weaponProperties,
  rangeNormal: B.rangeNormal,
  rangeLong: B.rangeLong,
  armorCategory: B.armorCategory,
  baseArmorClass: B.baseArmorClass,
  dexterityMode: B.dexterityMode,
  dexterityCap: B.dexterityCap,
  strengthRequirement: B.strengthRequirement,
  stealthDisadvantage: B.stealthDisadvantage,
});

/**
 * View for players who know the instance. Seen: its appearance and the name the players know it
 * by (magic items have no name until identified). Identified: the player view of the definition
 * and the charges, also when the definition is not released. Never GM notes or owners the player
 * may not see.
 */
export const ResponseItemInstancePlayerSchema = z.strictObject({
  view: z.literal("PLAYER"),
  id: uuidDto,
  knowledgeLevel: z.enum(["SEEN", "IDENTIFIED"]),
  name: z.string().nullable(),
  description: z.string().nullable(),
  descriptionHtml: htmlDto.nullable(),
  quantity: I.quantity,
  condition: I.condition,
  ownerType: I.ownerType,
  ownerAssetId: I.ownerAssetId,
  equipped: I.equipped,
  attuned: I.attuned,
  currentCharges: I.currentCharges,
  appearance: ResponseItemAppearanceSchema,
  item: ResponseItemPlayerSchema.nullable(),
});

export const ResponseItemInstanceSchema = z.discriminatedUnion("view", [
  ResponseItemInstanceFullSchema,
  ResponseItemInstancePlayerSchema,
]);

export const ResponseItemInstanceListSchema = standardListResponseDto(ResponseItemInstanceSchema);

export const ResponseItemTransferSchema = z.strictObject({
  /** The instance the command was sent for; the same as `transferred` when the whole stack moved. */
  source: ResponseItemInstanceFullSchema,
  transferred: ResponseItemInstanceFullSchema,
});

export const ResponseItemSplitSchema = z.strictObject({
  /** The stack the pieces were taken from. */
  source: ResponseItemInstanceFullSchema,
  /** The new stack with the pieces taken off. */
  split: ResponseItemInstanceFullSchema,
});

export type ResponseItemSplitDto = z.infer<typeof ResponseItemSplitSchema>;
export type ResponseItemKnowledgeDto = z.infer<typeof ResponseItemKnowledgeSchema>;
export type ResponseItemInstanceFullDto = z.infer<typeof ResponseItemInstanceFullSchema>;
export type ResponseItemInstancePlayerDto = z.infer<typeof ResponseItemInstancePlayerSchema>;
export type ResponseItemInstanceDto = z.infer<typeof ResponseItemInstanceSchema>;
export type ResponseItemInstanceListDto = z.infer<typeof ResponseItemInstanceListSchema>;
export type ResponseItemTransferDto = z.infer<typeof ResponseItemTransferSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function markdown(value: string | null): string | null {
  return value === null ? null : renderSafeMarkdown("MARKDOWN", value);
}

function auditOf(row: {
  id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string;
  updatedBy: string | null;
}) {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function assetFieldsOf(asset: AssetRow, rulesetIds: readonly string[]) {
  return {
    assetId: asset.id,
    assetVersion: asset.version,
    campaignId: asset.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    sourceReference: (asset.sourceReference as Record<string, unknown> | null) ?? null,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
  };
}

const num = (value: number | string | null) => (value === null ? null : Number(value));

function appearanceOf(row: ItemRow) {
  return {
    category: row.category,
    weight: num(row.weight),
    weaponCategory: row.weaponCategory,
    weaponCombatType: row.weaponCombatType,
    damageDiceCount: row.damageDiceCount,
    damageDiceFaces: row.damageDiceFaces as z.infer<typeof B.damageDiceFaces>,
    damageFixed: row.damageFixed,
    damageType: row.damageType,
    versatileDiceFaces: row.versatileDiceFaces as z.infer<typeof B.versatileDiceFaces>,
    weaponProperties: row.weaponProperties as z.infer<typeof B.weaponProperties>,
    rangeNormal: row.rangeNormal,
    rangeLong: row.rangeLong,
    armorCategory: row.armorCategory,
    baseArmorClass: row.baseArmorClass,
    dexterityMode: row.dexterityMode,
    dexterityCap: row.dexterityCap,
    strengthRequirement: row.strengthRequirement,
    stealthDisadvantage: row.stealthDisadvantage,
  };
}

function coreOf(row: ItemRow, definition: ItemDefinitionParts) {
  return {
    ...appearanceOf(row),
    code: row.code,
    description: row.description,
    descriptionHtml: markdown(row.description),
    costAmount: row.costAmount,
    costCurrency: row.costCurrency,
    isMagical: row.isMagical,
    isStackable: row.isStackable,
    consumedOnUse: row.consumedOnUse,
    masteryProperty: row.masteryProperty,
    toolCategory: row.toolCategory,
    toolAbility: row.toolAbility,
    toolUses: row.toolUses,
    capacityValue: num(row.capacityValue),
    capacityUnit: row.capacityUnit,
    capacityWeight: num(row.capacityWeight),
    magicBonus: row.magicBonus,
    magicItemType: row.magicItemType,
    rarity: row.rarity,
    attunementMode: row.attunementMode,
    attunementPrerequisite: row.attunementPrerequisite,
    chargesMaximum: row.chargesMaximum,
    ...definition,
  };
}

export function toItemFullResponse({ item: row, asset, rulesetIds }: ItemRecord): ResponseItemFullDto {
  return {
    view: "FULL",
    ...auditOf(row),
    ...assetFieldsOf(asset, rulesetIds),
    ...coreOf(row, readItemDefinition(row)),
    gmNotes: row.gmNotes,
    gmNotesHtml: markdown(row.gmNotes),
    forkedFromAssetId: row.forkedFromAssetId,
  };
}

/** The item as a player sees it; the caller made sure the definition parses. */
export function toItemPlayerResponse(
  { item: row, asset }: ItemWithAsset,
  definition: ItemDefinitionParts,
  isVisible: (assetId: string) => boolean,
): ResponseItemPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(row, toPlayerParts(definition, isVisible)),
  };
}

function listItemOf({ item: row, asset }: ItemWithAsset) {
  return {
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    category: row.category,
    costAmount: row.costAmount,
    costCurrency: row.costCurrency,
    weight: num(row.weight),
    isMagical: row.isMagical,
    isStackable: row.isStackable,
    rarity: row.rarity,
    attunementMode: row.attunementMode,
    weaponCategory: row.weaponCategory,
    armorCategory: row.armorCategory,
    selectable: asset.status === "ACTIVE",
  };
}

export function toItemListItemFullResponse(record: ItemRecord) {
  const asset = assetFieldsOf(record.asset, record.rulesetIds);

  return {
    view: "FULL" as const,
    ...auditOf(record.item),
    ...listItemOf(record),
    assetVersion: asset.assetVersion,
    campaignId: asset.campaignId,
    status: asset.status,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: asset.rulesetIds,
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
  };
}

export function toItemListItemPlayerResponse(item: ItemWithAsset) {
  return { view: "PLAYER" as const, ...listItemOf(item) };
}

export function toItemPageResponse(params: {
  page: ItemPage;
  data: ResponseItemListDto["data"];
  limit: number;
}): ResponseItemListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last ? encodePaginationCursor({ sortValue: last.item.code, id: last.item.id }) : null,
  });
}

export function toKnowledgeResponse(row: ItemKnowledgeRow): ResponseItemKnowledgeDto {
  return {
    ...auditOf(row),
    instanceId: row.instanceId,
    userId: row.userId,
    knowledgeLevel: row.knowledgeLevel,
    knownName: row.knownName,
    knownDescription: row.knownDescription,
  };
}

export function toItemInstanceFullResponse(
  row: ItemInstanceRow,
  definition: ItemWithAsset,
  knowledge: readonly ItemKnowledgeRow[],
): ResponseItemInstanceFullDto {
  const { item, asset } = definition;

  return {
    view: "FULL",
    ...auditOf(row),
    campaignId: row.campaignId,
    itemAssetId: row.itemAssetId,
    customName: row.customName,
    name: row.customName ?? asset.title,
    quantity: row.quantity,
    ownerType: row.ownerType,
    ownerAssetId: row.ownerAssetId,
    condition: row.condition,
    currentCharges: row.currentCharges,
    equipped: row.equipped,
    attuned: row.attuned,
    notes: row.notes,
    notesHtml: markdown(row.notes),
    item: {
      id: item.id,
      assetId: asset.id,
      scope: asset.scope,
      status: asset.status,
      name: asset.title,
      code: item.code,
      category: item.category,
      isMagical: item.isMagical,
      isStackable: item.isStackable,
      rarity: item.rarity,
      attunementMode: item.attunementMode,
      chargesMaximum: item.chargesMaximum,
      weight: num(item.weight),
    },
    knowledge: knowledge.map(toKnowledgeResponse),
  };
}

/**
 * An instance as a player who knows it sees it. `definition` is the player view of the definition
 * when identified; `ownerVisible` says whether the player may see the owner.
 */
export function toItemInstancePlayerResponse(
  row: ItemInstanceRow,
  found: ItemWithAsset,
  knowledge: EffectiveKnowledge,
  input: { definition: ResponseItemPlayerDto | null; ownerVisible: boolean },
): ResponseItemInstancePlayerDto {
  const identified = knowledge.knowledgeLevel === "IDENTIFIED";
  // Unidentified magic items don't give their name away; mundane ones have nothing to hide.
  const fallbackName = identified ? (row.customName ?? found.asset.title) : found.item.isMagical ? null : found.asset.title;
  const fallbackDescription = identified || !found.item.isMagical ? found.item.description : null;
  const description = knowledge.knownDescription ?? fallbackDescription;

  return {
    view: "PLAYER",
    id: row.id,
    knowledgeLevel: knowledge.knowledgeLevel,
    name: knowledge.knownName ?? fallbackName,
    description,
    descriptionHtml: markdown(description),
    quantity: row.quantity,
    condition: row.condition,
    ownerType: input.ownerVisible ? row.ownerType : "UNASSIGNED",
    ownerAssetId: input.ownerVisible ? row.ownerAssetId : null,
    equipped: row.equipped,
    attuned: row.attuned,
    currentCharges: identified ? row.currentCharges : null,
    appearance: appearanceOf(found.item),
    item: identified ? input.definition : null,
  };
}

export function toItemInstancePageResponse(params: {
  page: ItemInstancePage;
  data: ResponseItemInstanceListDto["data"];
  limit: number;
}): ResponseItemInstanceListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
        : null,
  });
}
