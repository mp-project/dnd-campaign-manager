import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { RulesetBaseSchema } from "#src/modules/ruleset/domain/dto/BaseRulesetDto";
import { rulesets } from "#src/modules/ruleset/domain/entities/RulesetTable";

export const RULESET_ENTITY_TYPE = "ruleset";

export const RULESET_ACTIONS = {
  create: "ruleset.create",
  update: "ruleset.update",
  delete: "ruleset.delete",
} as const;

/**
 * History rules of a ruleset. Only administrators may change rulesets, and they pass every check
 * in the history anyway, so everybody else is denied here. The progression tables are only written
 * together with a new ruleset and never change, so they have no history of their own.
 */
export const trackedRuleset = defineTrackedEntity({
  type: RULESET_ENTITY_TYPE,
  table: rulesets,
  baseSchema: RulesetBaseSchema,
  access: {
    read: () => false,
  },
  fields: {
    name: field.value(),
    description: field.value(),
    status: field.value(),
    sourceReference: field.value(),
    attribution: field.value(),
    // Set once when the ruleset is created.
    code: field.ignore(),
    editionYear: field.ignore(),
    licenseCode: field.ignore(),
  },
});
