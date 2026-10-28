import { z } from "zod";

import {
  AssetBaseSchema,
  AssetEditableStatusSchema,
} from "#src/modules/assets/domain/dto/BaseAssetDto";

/**
 * Input for the internal `createBase` port used by domain modules.
 *
 * Scope, origin and campaign binding are derived by the service; `rulesetIds`
 * are only accepted for system assets because campaign assets inherit the campaign ruleset.
 */
export const CreateAssetBaseSchema = AssetBaseSchema.pick({
  assetType: true,
  title: true,
  slug: true,
  summary: true,
  assetFamilyId: true,
  rulesetIds: true,
  sourceReference: true,
})
  .partial({
    slug: true,
    summary: true,
    assetFamilyId: true,
    rulesetIds: true,
    sourceReference: true,
  })
  .extend({
    status: AssetEditableStatusSchema.default("DRAFT"),
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
  });

export type CreateAssetBaseDto = z.input<typeof CreateAssetBaseSchema>;
export type CreateAssetBaseParsedDto = z.infer<typeof CreateAssetBaseSchema>;
