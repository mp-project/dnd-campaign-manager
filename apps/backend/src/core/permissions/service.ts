import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/http/domain-errors";
import type { CampaignContext, CampaignRole } from "#core/http/request-context";
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
  allowedCampaignRoles: readonly CampaignRole[];
  resourcePolicy?: PermissionPolicy;
};

type RequireOptions = {
  hideAsNotFoundForPlayers?: boolean;
};

export class PermissionService {
  private readonly definitionsByKey = new Map<string, PermissionDefinition>();

  private readonly ownerByKey = new Map<string, string>();

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

  can(
    key: string,
    context: CampaignContext,
    resource?: PermissionResource,
  ): boolean {
    if (context.systemRole === "ADMIN") {
      return true;
    }

    const definition = this.definitionsByKey.get(key);

    if (!definition || !context.campaignRole) {
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

    if (options.hideAsNotFoundForPlayers && context.systemRole !== "ADMIN") {
      throw new NotFoundError("Resource not found");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  listEffectivePermissions(context: CampaignContext): string[] {
    if (context.systemRole === "ADMIN") {
      return Array.from(this.definitionsByKey.keys()).sort();
    }

    if (!context.campaignRole) {
      return [];
    }

    return Array.from(this.definitionsByKey.values())
      .filter((definition) =>
        definition.allowedCampaignRoles.includes(context.campaignRole as CampaignRole),
      )
      .map((definition) => definition.key)
      .sort();
  }

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

export function createPermissionService(): PermissionService {
  const service = new PermissionService();
  service.registerDefinitions("core", defaultPermissionDefinitions);
  return service;
}
