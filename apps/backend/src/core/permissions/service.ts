import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/error/http/index";
import type {
  CampaignContext,
} from "#core/http/requestContext";
import type { CampaignRole, SystemRole } from "#core/permissions/roles";
import {
  isElevatedSystemRole,
  SYSTEM_ROLE,
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
  allowedCampaignRoles: readonly CampaignRole[];
  resourcePolicy?: PermissionPolicy;
};

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

    if (
      context.systemRole === SYSTEM_ROLE.SYSTEM ||
      context.systemRole === SYSTEM_ROLE.SUPER_ADMIN
    ) {
      return true;
    }

    const rolePermissions = this.permissionsBySystemRole.get(context.systemRole);

    if (rolePermissions?.has(key)) {
      return true;
    }

    if (definition.allowedSystemRoles?.includes(context.systemRole)) {
      return true;
    }

    if (!context.campaignRole) {
      return false;
    }

    if (!definition.allowedCampaignRoles.includes(context.campaignRole)) {
      return false;
    }

    const hasEffectivePermission = context.permissions.includes(key);

    if (!hasEffectivePermission) {
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

    if (options.hideAsNotFoundForPlayers && !isElevatedSystemRole(context.systemRole)) {
      throw new NotFoundError("Resource not found");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  /**
   * Lists permissions effectively available for the given context.
   *
   * @param context Resolved campaign context.
   * @returns Sorted permission keys.
   */
  listEffectivePermissions(context: CampaignContext): string[] {
    if (
      context.systemRole === SYSTEM_ROLE.SYSTEM ||
      context.systemRole === SYSTEM_ROLE.SUPER_ADMIN
    ) {
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
        continue;
      }

      if (!context.campaignRole) {
        continue;
      }

      if (definition.allowedCampaignRoles.includes(context.campaignRole as CampaignRole)) {
        effectivePermissions.add(definition.key);
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
    allowedCampaignRoles: ["EDITOR"],
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "campaign.special",
    description: "Execute special actions in own campaign",
    allowedCampaignRoles: ["EDITOR"],
    resourcePolicy: allPolicies(
      sameCampaignPolicy,
      activeMembershipPolicy,
      notDeletedResourcePolicy,
    ),
  },
  {
    key: "campaign.readShared",
    description: "Read shared campaign resources",
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
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
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
    resourcePolicy: allPolicies(sameCampaignPolicy, activeMembershipPolicy),
  },
  {
    key: "character.readOwn",
    description: "Read own assigned player character",
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
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
    allowedCampaignRoles: ["EDITOR", "PLAYER"],
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
