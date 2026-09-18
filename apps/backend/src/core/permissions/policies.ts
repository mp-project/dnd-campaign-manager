import type { CampaignContext } from "#core/http/request-context";

export type PermissionResource = {
  campaignId?: string;
  campaignMemberId?: string | null;
  membershipActive?: boolean;
  assetShared?: boolean;
  outlineShared?: boolean;
  ownerActorId?: string | null;
  assignmentActive?: boolean;
  deletedAt?: Date | string | null;
};

export type PermissionPolicy = (
  context: CampaignContext,
  resource?: PermissionResource,
) => boolean;

export function sameCampaignPolicy(
  context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  if (!resource?.campaignId) {
    return true;
  }

  return resource.campaignId === context.campaignId;
}

export function activeMembershipPolicy(
  context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  if (context.systemRole === "ADMIN") {
    return true;
  }

  const activeFromResource = resource?.membershipActive;

  if (typeof activeFromResource === "boolean") {
    return activeFromResource;
  }

  return context.campaignMemberId !== null && context.campaignRole !== null;
}

export function sharedAssetOrOutlinePolicy(
  _context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  return Boolean(resource?.assetShared || resource?.outlineShared);
}

export function ownCharacterActiveAssignmentPolicy(
  context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  if (!context.actorId) {
    return false;
  }

  return (
    resource?.ownerActorId === context.actorId && resource.assignmentActive === true
  );
}

export function notDeletedResourcePolicy(
  _context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  return resource?.deletedAt == null;
}

export function allPolicies(
  ...policies: PermissionPolicy[]
): PermissionPolicy {
  return (context, resource) =>
    policies.every((policy) => policy(context, resource));
}
