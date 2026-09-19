import type { CampaignContext } from "#core/http/requestContext";

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

/**
 * Validates that a resource belongs to the current campaign scope.
 *
 * @param context Campaign context of the actor.
 * @param resource Optional resource facts.
 * @returns True when campaign ids match or resource has no campaign binding.
 */
export function sameCampaignPolicy(
  context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  if (!resource?.campaignId) {
    return true;
  }

  return resource.campaignId === context.campaignId;
}

/**
 * Ensures the actor has an active campaign membership.
 *
 * @param context Campaign context of the actor.
 * @param resource Optional resource facts that may carry explicit membership state.
 * @returns True when membership is active.
 */
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

/**
 * Allows access to shared assets or shared campaign outline resources.
 *
 * @param _context Campaign context (unused).
 * @param resource Optional resource facts.
 * @returns True when the resource is shared.
 */
export function sharedAssetOrOutlinePolicy(
  _context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  return Boolean(resource?.assetShared || resource?.outlineShared);
}

/**
 * Ensures the actor owns the character and assignment is still active.
 *
 * @param context Campaign context of the actor.
 * @param resource Optional resource facts.
 * @returns True when assignment belongs to actor and is active.
 */
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

/**
 * Rejects resources that were soft-deleted.
 *
 * @param _context Campaign context (unused).
 * @param resource Optional resource facts.
 * @returns True when resource is not deleted.
 */
export function notDeletedResourcePolicy(
  _context: CampaignContext,
  resource?: PermissionResource,
): boolean {
  return resource?.deletedAt == null;
}

/**
 * Composes multiple permission policies using logical AND.
 *
 * @param policies Policies to evaluate.
 * @returns Combined policy returning true only if all policies pass.
 */
export function allPolicies(
  ...policies: PermissionPolicy[]
): PermissionPolicy {
  return (context, resource) =>
    policies.every((policy) => policy(context, resource));
}
