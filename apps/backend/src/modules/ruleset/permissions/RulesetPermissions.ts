import type { PermissionDefinition } from "#core/permissions/service";
import { SYSTEM_ROLE } from "#core/permissions/roles";

export const rulesetPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: "rulesets.read",
    description: "Read ruleset catalogs and progression tables",
    allowedSystemRoles: [SYSTEM_ROLE.USER],
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
  },
  {
    key: "rulesets.create",
    description: "Create rulesets",
    allowedSystemRoles: [SYSTEM_ROLE.ADMIN],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.update",
    description: "Update rulesets",
    allowedSystemRoles: [SYSTEM_ROLE.ADMIN],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.delete",
    description: "Delete rulesets (soft delete)",
    allowedSystemRoles: [SYSTEM_ROLE.ADMIN],
    allowedCampaignRoles: [],
  },
  {
    key: "rulesets.validate",
    description: "Validate ruleset compatibility",
    allowedSystemRoles: [SYSTEM_ROLE.ADMIN],
    allowedCampaignRoles: [],
  },
];
