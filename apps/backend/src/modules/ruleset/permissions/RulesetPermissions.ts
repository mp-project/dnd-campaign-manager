import type { PermissionDefinition } from "#core/permissions/service";

export const rulesetPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: "rulesets.read",
    description: "Read ruleset catalogs and progression tables",
    allowedSystemRoles: ["USER"],
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
  },
  {
    key: "rulesets.create",
    description: "Create rulesets",
    allowedSystemRoles: ["ADMIN"],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.update",
    description: "Update rulesets",
    allowedSystemRoles: ["ADMIN"],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.delete",
    description: "Delete rulesets (soft delete)",
    allowedSystemRoles: ["ADMIN"],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.validate",
    description: "Validate ruleset compatibility",
    allowedSystemRoles: ["ADMIN"],
    allowedCampaignRoles: [],
  },
];
