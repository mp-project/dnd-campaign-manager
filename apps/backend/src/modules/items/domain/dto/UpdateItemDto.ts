import { z } from "zod";

import { expectedVersionDto, uuidDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import {
  ItemBaseSchema,
  ItemInstanceBaseSchema,
  ItemKnowledgeBaseSchema,
} from "#src/modules/items/domain/dto/BaseItemDto";
import { ITEM_MAX_CHARGES, ITEM_MAX_QUANTITY } from "#src/modules/items/domain/entities/ItemsTable";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

const atLeastOneField = (value: Record<string, unknown>) =>
  Object.entries(value).some(
    ([key, fieldValue]) =>
      key !== "expectedVersion" && key !== "expectedAssetVersion" && fieldValue !== undefined,
  );

const atLeastOneFieldMessage = { message: "At least one field must be provided for patch updates" };

/**
 * Both versions come from the last response. The rules across fields are checked on the merged
 * state, so changing the category means sending the fields of the new category and emptying (null)
 * those of the old one in the same request. The category details, the magic fields and the parts
 * count as one unit in conflict checks.
 */
export const UpdateItemSchema = ItemBaseSchema.omit({
  id: true,
  assetId: true,
  campaignId: true,
  scope: true,
  status: true,
  forkedFromAssetId: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

/** Deleting archives the asset and restoring brings it back, so both use the asset version. */
export const ItemLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateItemDto = z.infer<typeof UpdateItemSchema>;
export type ItemLifecycleCommandDto = z.infer<typeof ItemLifecycleCommandSchema>;

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

const I = ItemInstanceBaseSchema.shape;

/** Who has an instance: nobody, or an asset of the campaign of the fitting type. */
const ownerShape = {
  ownerType: I.ownerType.default("UNASSIGNED"),
  ownerAssetId: I.ownerAssetId.default(null),
};

/**
 * A new instance of a definition the campaign may use. Charges start full unless given; equipping
 * and attuning are commands of their own.
 */
export const CreateItemInstanceSchema = z.strictObject({
  itemDefinitionAssetId: uuidDto,
  quantity: I.quantity.default(1),
  customName: I.customName.default(null),
  ...ownerShape,
  state: z
    .strictObject({
      condition: I.condition.default("PRISTINE"),
      currentCharges: I.currentCharges.optional(),
      notes: I.notes.default(null),
    })
    .default({ condition: "PRISTINE", notes: null }),
});

/** The state of an instance; quantity, owner, equipment and attunement have their commands. */
export const UpdateItemInstanceSchema = z
  .strictObject({
    customName: I.customName.optional(),
    condition: I.condition.optional(),
    currentCharges: I.currentCharges.optional(),
    notes: I.notes.optional(),
  })
  .extend(expectedVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

/**
 * Gives the instance to another owner. With `quantity` below the stack size only that many pieces
 * move, into a new instance; equipment and attunement end either way.
 */
export const TransferItemInstanceSchema = z
  .strictObject({
    ownerType: I.ownerType,
    ownerAssetId: I.ownerAssetId.default(null),
    quantity: z.number().int().min(1).max(ITEM_MAX_QUANTITY).optional(),
  })
  .extend(expectedVersionDto.shape);

/** Adds (positive) or removes (negative) pieces; a stack never drops below one piece. */
export const AdjustItemQuantitySchema = z
  .strictObject({ delta: z.number().int().min(-ITEM_MAX_QUANTITY).max(ITEM_MAX_QUANTITY).refine((value) => value !== 0, "The change can't be zero") })
  .extend(expectedVersionDto.shape);

export const EquipItemInstanceSchema = z
  .strictObject({ equipped: z.boolean() })
  .extend(expectedVersionDto.shape);

export const AttuneItemInstanceSchema = z
  .strictObject({ attuned: z.boolean() })
  .extend(expectedVersionDto.shape);

/** Takes pieces off a stack into a new stack of the same owner, in the same state. */
export const SplitItemInstanceSchema = z
  .strictObject({ quantity: z.number().int().min(1).max(ITEM_MAX_QUANTITY) })
  .extend(expectedVersionDto.shape);

/**
 * Puts all pieces of this stack onto `intoInstanceId` and deletes this one. Both versions come from
 * the last responses.
 */
export const MergeItemInstancesSchema = z
  .strictObject({
    intoInstanceId: uuidDto,
    expectedTargetVersion: z.number().int().positive(),
  })
  .extend(expectedVersionDto.shape);

/** Spends charges of a single piece; never more than are left. */
export const SpendItemChargeSchema = z
  .strictObject({ amount: z.number().int().min(1).max(ITEM_MAX_CHARGES).default(1) })
  .extend(expectedVersionDto.shape);

/**
 * Sets what players know about the instance: one player (`userId`) or all players (null). A new
 * entry is written without `expectedVersion`; an existing one needs its version, so two people
 * can't overwrite each other unnoticed (412).
 */
export const IdentifyItemInstanceSchema = z.strictObject({
  userId: ItemKnowledgeBaseSchema.shape.userId.default(null),
  knowledgeLevel: ItemKnowledgeBaseSchema.shape.knowledgeLevel,
  knownName: ItemKnowledgeBaseSchema.shape.knownName.default(null),
  knownDescription: ItemKnowledgeBaseSchema.shape.knownDescription.default(null),
  expectedVersion: z.number().int().positive().optional(),
});

export const DeleteItemInstanceSchema = z.strictObject({
  expectedVersion: z.coerce.number().int().positive(),
});

export type CreateItemInstanceDto = z.infer<typeof CreateItemInstanceSchema>;
export type UpdateItemInstanceDto = z.infer<typeof UpdateItemInstanceSchema>;
export type TransferItemInstanceDto = z.infer<typeof TransferItemInstanceSchema>;
export type AdjustItemQuantityDto = z.infer<typeof AdjustItemQuantitySchema>;
export type EquipItemInstanceDto = z.infer<typeof EquipItemInstanceSchema>;
export type AttuneItemInstanceDto = z.infer<typeof AttuneItemInstanceSchema>;
export type SplitItemInstanceDto = z.infer<typeof SplitItemInstanceSchema>;
export type MergeItemInstancesDto = z.infer<typeof MergeItemInstancesSchema>;
export type SpendItemChargeDto = z.infer<typeof SpendItemChargeSchema>;
export type IdentifyItemInstanceDto = z.infer<typeof IdentifyItemInstanceSchema>;
export type DeleteItemInstanceDto = z.infer<typeof DeleteItemInstanceSchema>;
