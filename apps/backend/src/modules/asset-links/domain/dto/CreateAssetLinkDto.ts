import { z } from "zod";

import { AssetLinkBaseSchema } from "#src/modules/asset-links/domain/dto/BaseAssetLinkDto";

/** The metadata is checked against the schema of the relation in the service. */
export const CreateAssetLinkSchema = AssetLinkBaseSchema.pick({
  targetAssetId: true,
  relationType: true,
}).extend({
  label: AssetLinkBaseSchema.shape.label.optional(),
  sortOrder: AssetLinkBaseSchema.shape.sortOrder.optional(),
  metadata: AssetLinkBaseSchema.shape.metadata.default({}),
});

export type CreateAssetLinkDto = z.infer<typeof CreateAssetLinkSchema>;
