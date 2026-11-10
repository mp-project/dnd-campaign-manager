import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { CLASS_MAX_LEVEL } from "#src/modules/classes/index";
import { SubclassDefinitionSchema } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import { SUBCLASS_DESCRIPTION_MAX_LENGTH } from "#src/modules/subclasses/domain/entities/SubclassesTable";

/**
 * All subclass fields with their validation rules, including the asset fields a subclass shows as
 * its own (`name` is the title of the asset). Request and response DTOs derive from this schema.
 */
export const SubclassBaseSchema = z
  .strictObject({
    id: uuidDto,
    assetId: uuidDto,
    campaignId: uuidDto.nullable(),
    scope: AssetBaseSchema.shape.scope,
    name: z.string().trim().min(1).max(160),
    summary: AssetBaseSchema.shape.summary,
    status: AssetBaseSchema.shape.status,
    /** The class the subclass belongs to (its id, not its asset id); set once. */
    classId: uuidDto,
    classAssetId: uuidDto,
    code: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    /** Markdown; only the rendered `descriptionHtml` of a response is HTML. */
    description: z.string().trim().min(1).max(SUBCLASS_DESCRIPTION_MAX_LENGTH).nullable(),
    displayOrder: z.number().int().min(0).max(1_000),
    /** Class level the subclass is chosen at; read from the class, never stored or sent. */
    selectionLevel: z.number().int().min(1).max(CLASS_MAX_LEVEL),
    sourceReference: AssetBaseSchema.shape.sourceReference,
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
    rulesetIds: AssetBaseSchema.shape.rulesetIds,
    assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
    /** Custom subclasses only: players of the campaign may see and choose the subclass. */
    releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
  })
  .extend(SubclassDefinitionSchema.shape);

export type SubclassBaseDto = z.infer<typeof SubclassBaseSchema>;
