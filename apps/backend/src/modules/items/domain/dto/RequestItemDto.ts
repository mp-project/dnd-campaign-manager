import { z } from "zod";

import { booleanQueryDto, paginationDto, uuidDto } from "#core/http/dto";
import { EFFECT_PAYLOAD_TYPES } from "#core/rules/contracts";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ActorSnapshotSchema } from "#src/modules/features/index";
import { ItemBaseSchema, ItemInstanceBaseSchema } from "#src/modules/items/domain/dto/BaseItemDto";
import { ITEM_MAX_CHARGES } from "#src/modules/items/domain/entities/ItemsTable";

export const RequestCampaignParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignItemParamsSchema = RequestCampaignParamsSchema.extend({
  itemId: uuidDto,
});

export const RequestSystemItemParamsSchema = z.strictObject({
  itemId: uuidDto,
});

/** Params of routes shared by custom and global content; without a campaign it is global. */
export const RequestScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestItemParamsSchema = RequestScopeParamsSchema.extend({
  itemId: uuidDto,
});

const listFilterShape = ItemBaseSchema.pick({
  category: true,
  status: true,
  rarity: true,
  weaponCategory: true,
  armorCategory: true,
})
  .partial()
  .extend({
    rarity: ItemBaseSchema.shape.rarity.unwrap().optional(),
    weaponCategory: ItemBaseSchema.shape.weaponCategory.unwrap().optional(),
    armorCategory: ItemBaseSchema.shape.armorCategory.unwrap().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    magical: booleanQueryDto.optional(),
    /** Items that require attunement (`REQUIRED`) or allow it (`OPTIONAL`). */
    attunement: ItemBaseSchema.shape.attunementMode.optional(),
    /** Items with an effect of this payload type. */
    effect: z.enum(EFFECT_PAYLOAD_TYPES).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active items they may see. */
export const RequestCampaignItemsQuerySchema = z.strictObject(listFilterShape).extend(paginationDto.shape);

/** The catalog shows global items for the campaign ruleset and the campaign's own ones. */
export const RequestItemCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemItemsQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

/** Options of the attack with a weapon. */
const attackOptionsSchema = z
  .strictObject({
    /** Use a versatile weapon with two hands. */
    twoHanded: z.boolean().default(false),
    /** Overrides the proficiency the actor's `proficiencies` would give. */
    proficient: z.boolean().optional(),
  })
  .default({ twoHanded: false });

/**
 * What an item gives an actor in a state, without storing anything. The actor brings abilities,
 * proficiency bonus, proficiencies (`simple-weapons`, `martial-weapons`, `light-armor`,
 * `medium-armor`, `heavy-armor`, `shields`, an item code or an item asset id) and the character
 * level; missing values make the numbers that need them unknown.
 */
export const ResolveItemSchema = z.strictObject({
  actor: ActorSnapshotSchema.default({}),
  state: z
    .strictObject({
      carried: z.boolean().default(true),
      equipped: z.boolean().default(false),
      attuned: z.boolean().default(false),
      /** Charges left; default: all of them. */
      currentCharges: z.number().int().min(0).max(ITEM_MAX_CHARGES).optional(),
    })
    .default({ carried: true, equipped: false, attuned: false }),
  attack: attackOptionsSchema,
});

/** The same for an instance, whose stored state is used. */
export const ResolveItemInstanceSchema = z.strictObject({
  actor: ActorSnapshotSchema.default({}),
  attack: attackOptionsSchema,
});

export type RequestCampaignItemsQueryDto = z.infer<typeof RequestCampaignItemsQuerySchema>;
export type RequestItemCatalogQueryDto = z.infer<typeof RequestItemCatalogQuerySchema>;
export type RequestSystemItemsQueryDto = z.infer<typeof RequestSystemItemsQuerySchema>;
export type ResolveItemDto = z.infer<typeof ResolveItemSchema>;
export type ResolveItemInstanceDto = z.infer<typeof ResolveItemInstanceSchema>;

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export const RequestItemInstanceParamsSchema = RequestCampaignParamsSchema.extend({
  instanceId: uuidDto,
});

const I = ItemInstanceBaseSchema.shape;

export const RequestItemInstancesQuerySchema = z
  .strictObject({
    /** Instances of this definition (its asset id). */
    itemAssetId: uuidDto.optional(),
    ownerType: I.ownerType.optional(),
    ownerAssetId: uuidDto.optional(),
    equipped: booleanQueryDto.optional(),
    attuned: booleanQueryDto.optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .extend(paginationDto.shape);

export type RequestItemInstancesQueryDto = z.infer<typeof RequestItemInstancesQuerySchema>;
