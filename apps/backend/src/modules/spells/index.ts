export {
  SPELLS_MODULE_DEPENDENCIES,
  spellsModule,
  type SpellsModuleDependencies,
} from "#src/modules/spells/Setup";
export { spellsPermissionDefinitions } from "#src/modules/spells/permissions/SpellsPermissions";
export {
  spellCastingTimeTypeEnum,
  spellDurationTypeEnum,
  spellDurationUnitEnum,
  spellLists,
  spellRangeTypeEnum,
  spellRangeUnitEnum,
  spellSchoolEnum,
  spells,
} from "#src/modules/spells/domain/entities/SpellsTable";
export type {
  SpellListRow,
  SpellListWithAsset,
  SpellRow,
  SpellWithAsset,
} from "#src/modules/spells/domain/repository/SpellsRepository";
export type { SpellDefinition } from "#src/modules/spells/domain/dto/SpellDefinitionDto";
export {
  resolveSpellCast,
  type ResolvedSpellCast,
  SpellCastError,
} from "#src/modules/spells/domain/SpellCasting";
export { SpellsService } from "#src/modules/spells/service/SpellsService";
