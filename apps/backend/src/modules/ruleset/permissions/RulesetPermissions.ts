import type { PermissionDefinition } from "#core/permissions/service";

export const RULESET_PERMISSION_KEYS = [
  "rulesets.read",
  "rulesets.create",
  "rulesets.update",
  "rulesets.delete",
  "rulesets.validate",
] as const;

export const RULESET_READ_PERMISSION_KEYS = [RULESET_PERMISSION_KEYS[0]] as const;

export const RULESET_ADMIN_PERMISSION_KEYS = [
  RULESET_PERMISSION_KEYS[1],
  RULESET_PERMISSION_KEYS[2],
  RULESET_PERMISSION_KEYS[3],
  RULESET_PERMISSION_KEYS[4],
] as const;

export const rulesetPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: RULESET_PERMISSION_KEYS[0],
    description: "Read ruleset catalogs and progression tables",
  },
  {
    key: RULESET_PERMISSION_KEYS[1],
    description: "Create rulesets",
  },
  {
    key: RULESET_PERMISSION_KEYS[2],
    description: "Update rulesets",
  },
  {
    key: RULESET_PERMISSION_KEYS[3],
    description: "Delete rulesets (soft delete)",
  },
  {
    key: RULESET_PERMISSION_KEYS[4],
    description: "Validate ruleset compatibility",
  },
];
