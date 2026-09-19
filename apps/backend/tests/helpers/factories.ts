import { randomUUID } from "node:crypto";

import type { CampaignContext, RequestContext } from "#core/http/requestContext";

export type UserFactoryInput = {
  id?: string;
  email?: string;
  displayName?: string;
  systemRole?: "ADMIN" | "USER";
  status?: "ACTIVE" | "LOCKED" | "DISABLED";
};

export type CampaignFactoryInput = {
  id?: string;
  ownerUserId?: string;
  rulesetId?: string;
  name?: string;
  slug?: string;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

export type MembershipFactoryInput = {
  id?: string;
  campaignId?: string;
  userId?: string;
  role?: "EDITOR" | "PLAYER";
  status?: "PENDING" | "ACTIVE" | "REVOKED";
};

export type AssetFactoryInput = {
  id?: string;
  campaignId?: string;
  assetType?: string;
  scope?: "SYSTEM" | "CAMPAIGN";
  origin?: "DEFAULT" | "CUSTOM";
  rulesetId?: string | null;
  title?: string;
};

export function createUserFactory(input: UserFactoryInput = {}) {
  const id = input.id ?? randomUUID();

  return {
    id,
    email: input.email ?? `${id}@example.test`,
    displayName: input.displayName ?? "Test User",
    systemRole: input.systemRole ?? "USER",
    status: input.status ?? "ACTIVE",
  };
}

export function createCampaignFactory(input: CampaignFactoryInput = {}) {
  const id = input.id ?? randomUUID();

  return {
    id,
    ownerUserId: input.ownerUserId ?? randomUUID(),
    rulesetId: input.rulesetId ?? "ruleset-default",
    name: input.name ?? "Test Campaign",
    slug: input.slug ?? "test-campaign",
    status: input.status ?? "ACTIVE",
  };
}

export function createMembershipFactory(input: MembershipFactoryInput = {}) {
  return {
    id: input.id ?? randomUUID(),
    campaignId: input.campaignId ?? randomUUID(),
    userId: input.userId ?? randomUUID(),
    role: input.role ?? "PLAYER",
    status: input.status ?? "ACTIVE",
  };
}

export function createAssetFactory(input: AssetFactoryInput = {}) {
  return {
    id: input.id ?? randomUUID(),
    campaignId: input.campaignId ?? randomUUID(),
    assetType: input.assetType ?? "GENERIC",
    scope: input.scope ?? "CAMPAIGN",
    origin: input.origin ?? "CUSTOM",
    rulesetId: input.rulesetId ?? "ruleset-default",
    title: input.title ?? "Test Asset",
  };
}

export function createRequestContextFactory(
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    actorId: overrides.actorId ?? randomUUID(),
    systemRole: overrides.systemRole ?? "USER",
  };
}

export function createCampaignContextFactory(
  overrides: Partial<CampaignContext> = {},
): CampaignContext {
  return {
    actorId: overrides.actorId ?? randomUUID(),
    systemRole: overrides.systemRole ?? "USER",
    campaignId: overrides.campaignId ?? randomUUID(),
    rulesetId: overrides.rulesetId ?? "ruleset-default",
    campaignMemberId: overrides.campaignMemberId ?? randomUUID(),
    campaignRole: overrides.campaignRole ?? "PLAYER",
    permissions: overrides.permissions ?? [],
  };
}
