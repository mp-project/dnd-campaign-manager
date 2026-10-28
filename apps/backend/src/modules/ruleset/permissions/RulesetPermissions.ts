import type { PermissionDefinition } from "#core/permissions/service";

export const RULESET_PERMISSIONS = {
  read: "rulesets.read",
  create: "rulesets.create",
  update: "rulesets.update",
  delete: "rulesets.delete",
  validate: "rulesets.validate",
} as const;

export const RULESET_PERMISSION_KEYS = Object.values(RULESET_PERMISSIONS);

export const RULESET_READ_PERMISSION_KEYS = [RULESET_PERMISSIONS.read] as const;

export const RULESET_ADMIN_PERMISSION_KEYS = [
  RULESET_PERMISSIONS.create,
  RULESET_PERMISSIONS.update,
  RULESET_PERMISSIONS.delete,
  RULESET_PERMISSIONS.validate,
] as const;

export const rulesetPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: RULESET_PERMISSIONS.read,
    description: "Read ruleset catalogs and progression tables",
  },
  {
    key: RULESET_PERMISSIONS.create,
    description: "Create rulesets",
  },
  {
    key: RULESET_PERMISSIONS.update,
    description: "Update rulesets",
  },
  {
    key: RULESET_PERMISSIONS.delete,
    description: "Delete rulesets (soft delete)",
  },
  {
    key: RULESET_PERMISSIONS.validate,
    description: "Validate ruleset compatibility",
  },
];
