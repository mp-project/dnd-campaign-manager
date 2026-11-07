import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/error/http/index";
import type {
  CampaignContext,
  CampaignRole,
} from "#core/http/requestContext";
import type { SystemRole } from "#core/permissions/roles";
import {
  isSysAdminRole,
  isElevatedSystemRole,
} from "#core/permissions/roles";
import {
  activeMembershipPolicy,
  allPolicies,
  notDeletedResourcePolicy,
  ownCharacterActiveAssignmentPolicy,
  sameCampaignPolicy,
  sharedAssetOrOutlinePolicy,
  type PermissionPolicy,
  type PermissionResource,
} from "#core/permissions/policies";

export type PermissionDefinition = {
  key: string;
  description: string;
  allowedSystemRoles?: readonly SystemRole[];
  resourcePolicy?: PermissionPolicy;
  /**
   * Campaign roles that may use the key on a campaign route (`:campaignId`). Checked by the
   * authorization hook before the use case; system admins pass. Keys without it are not
   * campaign-bound (global routes or routes whose campaign comes from the row).
   */
  campaignRoles?: readonly CampaignRole[];
  /**
   * Answer for a member whose role is not listed: "forbidden" (403, default) or "notFound"
   * (404) where the use case hides the resource from that role.
   */
  campaignRoleDenial?: "forbidden" | "notFound";
};

/** Every member, also players. */
export const ANY_CAMPAIGN_ROLE: readonly CampaignRole[] = ["OWNER", "EDITOR", "PLAYER"];
/** Members who edit content. */
export const CAMPAIGN_EDITOR_ROLES: readonly CampaignRole[] = ["OWNER", "EDITOR"];
/** Only the owner (game master). */
export const CAMPAIGN_OWNER_ROLE: readonly CampaignRole[] = ["OWNER"];

export type SystemRolePermissionAssignments = Partial<
  Record<SystemRole, readonly string[]>
>;

type RequireOptions = {
  hideAsNotFoundForPlayers?: boolean;
};

/**
 * Central service for permission definition registration and runtime authorization checks.
 */
export class PermissionService {
  private readonly definitionsByKey = new Map<string, PermissionDefinition>();

  private readonly ownerByKey = new Map<string, string>();

  private readonly permissionsBySystemRole = new Map<SystemRole, Set<string>>();

  /**
   * Registers permission definitions for a module and enforces unique keys.
   *
   * @param moduleName Owning module name used for duplicate diagnostics.
   * @param definitions Permission definitions to register.
   */
  registerDefinitions(
    moduleName: string,
    definitions: readonly PermissionDefinition[],
  ): void {
    for (const definition of definitions) {
      const existingOwner = this.ownerByKey.get(definition.key);

      if (existingOwner) {
        throw new Error(
          `Permission key '${definition.key}' is already registered by module '${existingOwner}'`,
        );
      }

      this.definitionsByKey.set(definition.key, definition);
      this.ownerByKey.set(definition.key, moduleName);
    }
  }

  /**
   * Registers effective permission keys for system roles.
   *
   * This is intentionally additive so modules can extend role permissions over time.
   *
   * @param assignments Role to permission-key assignments.
   */
  registerSystemRolePermissions(assignments: SystemRolePermissionAssignments): void {
    for (const [role, permissionKeys] of Object.entries(assignments) as Array<
      [SystemRole, readonly string[] | undefined]
    >) {
      if (!permissionKeys || permissionKeys.length === 0) {
        continue;
      }

      const rolePermissions =
        this.permissionsBySystemRole.get(role) ?? new Set<string>();

      for (const permissionKey of permissionKeys) {
        rolePermissions.add(permissionKey);
      }

      this.permissionsBySystemRole.set(role, rolePermissions);
    }
  }

  /**
   * Evaluates whether a context is allowed to perform an action on an optional resource.
   *
   * @param key Permission key.
   * @param context Resolved campaign context for the request actor.
   * @param resource Optional resource facts for policy checks.
   * @returns True when the action is authorized.
   */
  can(
    key: string,
    context: CampaignContext,
    resource?: PermissionResource,
  ): boolean {
    const definition = this.definitionsByKey.get(key);

    if (!definition) {
      return false;
    }

    if (isElevatedSystemRole(context.systemRole)) {
      return true;
    }

    const rolePermissions = this.permissionsBySystemRole.get(context.systemRole);
    const hasRolePermission = Boolean(rolePermissions?.has(key));
    const hasSystemRolePermission =
      definition.allowedSystemRoles?.includes(context.systemRole) ?? false;

    if (!hasRolePermission && !hasSystemRolePermission) {
      return false;
    }

    if (!definition.resourcePolicy) {
      return true;
    }

    return definition.resourcePolicy(context, resource);
  }

  /**
   * Asserts authorization and throws domain errors when access is denied.
   *
   * @param key Permission key.
   * @param context Resolved campaign context.
   * @param resource Optional resource facts for policy checks.
   * @param options Error-shaping options for player-facing behavior.
   */
  require(
    key: string,
    context: CampaignContext,
    resource?: PermissionResource,
    options: RequireOptions = {},
  ): void {
    if (!context.actorId) {
      throw new UnauthenticatedError();
    }

    if (this.can(key, context, resource)) {
      return;
    }

    if (options.hideAsNotFoundForPlayers && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Resource not found");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  /**
   * Checks the campaign role for a key on a campaign route. Non-members get 404, so a campaign
   * they do not belong to stays invisible; members with another role get the key's denial.
   *
   * @param key Permission key.
   * @param context Campaign context built from the route's `:campaignId`.
   */
  requireCampaignRole(key: string, context: CampaignContext): void {
    const definition = this.definitionsByKey.get(key);

    if (!definition?.campaignRoles || isSysAdminRole(context.systemRole)) {
      return;
    }

    if (!context.campaignRole) {
      throw new NotFoundError("Campaign not found");
    }

    if (definition.campaignRoles.includes(context.campaignRole)) {
      return;
    }

    if (definition.campaignRoleDenial === "notFound") {
      throw new NotFoundError("Resource not found");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  /**
   * Lists permissions effectively available for the given context. In a campaign context, keys
   * bound to campaign roles only count for those roles.
   *
   * @param context Resolved campaign context.
   * @returns Sorted permission keys.
   */
  listEffectivePermissions(context: CampaignContext): string[] {
    if (isElevatedSystemRole(context.systemRole)) {
      return Array.from(this.definitionsByKey.keys()).sort();
    }

    const rolePermissions = this.permissionsBySystemRole.get(context.systemRole);
    const effectivePermissions = new Set<string>();

    for (const permissionKey of rolePermissions ?? []) {
      if (this.definitionsByKey.has(permissionKey)) {
        effectivePermissions.add(permissionKey);
      }
    }

    for (const definition of this.definitionsByKey.values()) {
      if (definition.allowedSystemRoles?.includes(context.systemRole)) {
        effectivePermissions.add(definition.key);
      }
    }

    if (context.campaignRole !== undefined && !isSysAdminRole(context.systemRole)) {
      for (const key of Array.from(effectivePermissions)) {
        const roles = this.definitionsByKey.get(key)?.campaignRoles;

        if (roles && (!context.campaignRole || !roles.includes(context.campaignRole))) {
          effectivePermissions.delete(key);
        }
      }
    }

    return Array.from(effectivePermissions).sort();
  }

  /**
   * Returns all registered permission definitions.
   *
   * @returns Registered permission definitions.
   */
  listDefinitions(): PermissionDefinition[] {
    return Array.from(this.definitionsByKey.values());
  }
}

export const defaultPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: "campaign.crud",
    description: "Create, update and delete resources in own campaign",
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "campaign.special",
    description: "Execute special actions in own campaign",
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "campaign.readShared",
    description: "Read shared campaign resources",
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      sharedAssetOrOutlinePolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "character.createOwn",
    description: "Create own player character in active membership",
    resourcePolicy: allPolicies(sameCampaignPolicy, activeMembershipPolicy),
  },
  {
    key: "character.readOwn",
    description: "Read own assigned player character",
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      ownCharacterActiveAssignmentPolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "character.updateOwn",
    description: "Update own assigned player character",
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      ownCharacterActiveAssignmentPolicy,
      notDeletedResourcePolicy,
    ),
  },
];

/**
 * Creates the default permission service preloaded with core definitions.
 *
 * @returns Initialized permission service.
 */
export function createPermissionService(): PermissionService {
  const service = new PermissionService();
  service.registerDefinitions("core", defaultPermissionDefinitions);
  service.registerSystemRolePermissions({
    ADMIN: defaultPermissionDefinitions.map((definition) => definition.key),
  });
  return service;
}
