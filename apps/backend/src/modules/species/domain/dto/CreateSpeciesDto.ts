import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import {
  SpeciesBaseSchema,
  SpeciesVariantBaseSchema,
} from "#src/modules/species/domain/dto/BaseSpeciesDto";
import {
  validateGrantKeys,
  validateSpeciesDefinition,
} from "#src/modules/species/domain/SpeciesDefinition";

const assetCreateShape = {
  summary: SpeciesBaseSchema.shape.summary.optional(),
  status: AssetEditableStatusSchema.default("ACTIVE"),
  releasedToPlayers: SpeciesBaseSchema.shape.releasedToPlayers.default(false),
  sourceReference: SpeciesBaseSchema.shape.sourceReference.optional(),
  rulesetIds: SpeciesBaseSchema.shape.rulesetIds.optional(),
  assetFamilyId: SpeciesBaseSchema.shape.assetFamilyId.optional(),
};

/**
 * Asset and species are created in one transaction. Scope, campaign and origin follow from the
 * route; `rulesetIds` are only accepted for global species, custom species use the ruleset of their
 * campaign. Without `code` it is derived from the name. Variants are created afterwards, each as an
 * asset of its own.
 */
export const CreateSpeciesSchema = SpeciesBaseSchema.pick({
  name: true,
  creatureType: true,
  lifespanMode: true,
  sizeOptions: true,
  movementModes: true,
})
  .extend({
    ...assetCreateShape,
    code: SpeciesBaseSchema.shape.code.optional(),
    description: SpeciesBaseSchema.shape.description.optional(),
    displayOrder: SpeciesBaseSchema.shape.displayOrder.default(0),
    rulesetPolicy: SpeciesBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
    ageProfile: SpeciesBaseSchema.shape.ageProfile.default(null),
    physicalProfile: SpeciesBaseSchema.shape.physicalProfile.default(null),
    textSections: SpeciesBaseSchema.shape.textSections.default([]),
    variantGroups: SpeciesBaseSchema.shape.variantGroups.default([]),
    featureGrants: SpeciesBaseSchema.shape.featureGrants.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of validateSpeciesDefinition(value, value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

/**
 * A variant of the species in the route. Without `rulesetPolicy` it takes the rulesets of its
 * species; a global variant may be limited to some of them. Grants are checked against those of the
 * species by the service.
 */
export const CreateSpeciesVariantSchema = SpeciesVariantBaseSchema.pick({
  name: true,
  variantGroupCode: true,
})
  .extend({
    ...assetCreateShape,
    code: SpeciesVariantBaseSchema.shape.code.optional(),
    description: SpeciesVariantBaseSchema.shape.description.optional(),
    displayOrder: SpeciesVariantBaseSchema.shape.displayOrder.default(0),
    rulesetPolicy: SpeciesVariantBaseSchema.shape.rulesetPolicy.optional(),
    featureGrants: SpeciesVariantBaseSchema.shape.featureGrants.default([]),
  })
  .superRefine((value, ctx) => {
    // Targets may be granted by the species; the service checks them against it.
    for (const issue of validateGrantKeys(value.featureGrants, ["featureGrants"])) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateSpeciesDto = z.infer<typeof CreateSpeciesSchema>;
export type CreateSpeciesVariantDto = z.infer<typeof CreateSpeciesVariantSchema>;
