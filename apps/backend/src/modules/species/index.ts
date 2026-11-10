export {
  SPECIES_MODULE_DEPENDENCIES,
  speciesModule,
  type SpeciesModuleDependencies,
} from "#src/modules/species/Setup";
export { speciesPermissionDefinitions } from "#src/modules/species/permissions/SpeciesPermissions";
export {
  species,
  speciesCreatureTypeEnum,
  speciesLifespanModeEnum,
  speciesVariants,
} from "#src/modules/species/domain/entities/SpeciesTable";
export type {
  SpeciesRow,
  SpeciesVariantRow,
  SpeciesVariantWithAsset,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
export type {
  SpeciesDefinition,
  SpeciesFeatureGrant,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
export { MOVEMENT_MODES } from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
export type { SpeciesSelectionDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
export { SpeciesService } from "#src/modules/species/service/SpeciesService";
export { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";
export { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
