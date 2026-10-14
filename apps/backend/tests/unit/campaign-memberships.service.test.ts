import { ConflictError, ForbiddenError, NotFoundError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

const CAMPAIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBERSHIP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createService(
  repositoryOverrides: Partial<CampaignMembershipsRepository> = {},
  campaignServiceOverrides: Partial<CampaignsService> = {},
) {
  const repository = {
    findActiveByUser: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    countActiveEditors: jest.fn(),
    listActiveByCampaign: jest.fn().mockResolvedValue([]),
    activatePending: jest.fn(),
    updateRole: jest.fn(),
    revoke: jest.fn(),
    ...repositoryOverrides,
  } as unknown as CampaignMembershipsRepository;
  const transactionManager: TransactionManager = {
    inTransaction: async (work) => work({} as AppDatabase),
  };
  const campaignsService = {
    findMembershipCampaign: jest.fn().mockResolvedValue({
      id: CAMPAIGN_ID,
      ownerUserId: OWNER_ID,
      rulesetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }),
    lockCampaign: jest.fn(),
    ...campaignServiceOverrides,
  } as unknown as CampaignsService;
  const usersDependencies = {
    service: {
      listPublicSummaries: jest.fn(async (userIds: string[]) =>
        userIds.map((id) => ({ id, userTag: "member#000001", displayName: "Member" })),
      ),
    },
    useCases: {
      getOneUserBy: {
        execute: jest.fn(async ({ userId }: { userId: string }) => ({ id: userId })),
      },
    },
  } as unknown as UsersModuleDependencies;

  return {
    service: new CampaignMembershipsService(
      {} as AppDatabase,
      transactionManager,
      repository,
      campaignsService,
      usersDependencies,
    ),
    repository,
    campaignsService,
  };
}

const ownerContext = { actorId: OWNER_ID, systemRole: "USER" as const };
const memberContext = { actorId: MEMBER_ID, systemRole: "USER" as const };

function activeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP_ID,
    campaignId: CAMPAIGN_ID,
    userId: MEMBER_ID,
    role: "EDITOR",
    status: "ACTIVE",
    joinedAt: new Date(),
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe("CampaignMembershipsService", () => {
  it("allows active editors to read membership data", async () => {
    const members = [activeMember()];
    const { service } = createService({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember()),
      listActiveByCampaign: jest.fn().mockResolvedValue(members),
    });

    await expect(service.listMembers(memberContext, CAMPAIGN_ID)).resolves.toEqual({
      members: members.map((membership) => ({
        membership,
        userId: membership.userId,
        userTag: "member#000001",
        displayName: "Member",
      })),
      canManage: true,
    });
  });

  it("marks player member lists as limited", async () => {
    const members = [activeMember({ role: "PLAYER" })];
    const { service } = createService({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember({ role: "PLAYER" })),
      listActiveByCampaign: jest.fn().mockResolvedValue(members),
    });

    await expect(service.listMembers(memberContext, CAMPAIGN_ID)).resolves.toEqual({
      members: members.map((membership) => ({
        membership,
        userId: membership.userId,
        userTag: "member#000001",
        displayName: "Member",
      })),
      canManage: false,
    });
  });

  it("hides a campaign from non-members", async () => {
    const { service } = createService();

    await expect(service.listMembers(memberContext, CAMPAIGN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("prevents demoting the campaign owner", async () => {
    const ownerMembership = activeMember({ userId: OWNER_ID });
    const { service, repository } = createService({
      findActiveByUser: jest.fn().mockResolvedValue(ownerMembership),
      findById: jest.fn().mockResolvedValue(ownerMembership),
    });

    await expect(
      service.changeRole(ownerContext, CAMPAIGN_ID, MEMBERSHIP_ID, {
        role: "PLAYER",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it("locks the campaign before checking management access", async () => {
    const lockCampaign = jest.fn();
    const findCampaign = jest.fn().mockResolvedValue({
      id: CAMPAIGN_ID,
      ownerUserId: OWNER_ID,
      rulesetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });
    const updateRole = jest.fn().mockResolvedValue(activeMember({ role: "EDITOR", version: 2 }));
    const { service } = createService({
      findActiveByUser: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(activeMember({ role: "PLAYER" })),
      updateRole,
    }, {
      lockCampaign,
      findMembershipCampaign: findCampaign,
    });

    await service.changeRole(ownerContext, CAMPAIGN_ID, MEMBERSHIP_ID, {
      role: "EDITOR",
      expectedVersion: 1,
    });

    expect(lockCampaign.mock.invocationCallOrder[0]).toBeLessThan(
      findCampaign.mock.invocationCallOrder[0]!,
    );
    expect(updateRole).toHaveBeenCalled();
  });

  it("prevents revoking the last active editor", async () => {
    const { service, repository } = createService({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember()),
      findById: jest.fn().mockResolvedValue(activeMember()),
      countActiveEditors: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.revoke(memberContext, CAMPAIGN_ID, MEMBERSHIP_ID),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.revoke).not.toHaveBeenCalled();
  });

  it("does not allow an actor to activate another user's invitation", async () => {
    const { service, repository } = createService();

    await expect(
      service.activateFromInvitation({
        campaignId: CAMPAIGN_ID,
        userId: MEMBER_ID,
        actorId: OWNER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.activatePending).not.toHaveBeenCalled();
  });
});
