import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionMeta, ActionScope, HistoryPort } from "#core/history/types";
import type { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import { DeleteCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/DeleteCampaignMemberUseCase";
import { GetMyCampaignPermissionsUseCase } from "#src/modules/campaign-memberships/useCase/GetMyCampaignPermissionsUseCase";
import { ListCampaignMembersUseCase } from "#src/modules/campaign-memberships/useCase/ListCampaignMembersUseCase";
import { UpdateCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/UpdateCampaignMemberUseCase";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

const CAMPAIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBERSHIP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createUseCases(
  repositoryOverrides: Partial<CampaignMembershipsRepository> = {},
  campaignServiceOverrides: Partial<CampaignsService> = {},
) {
  const repository = {
    findActiveByUser: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    countActiveEditors: jest.fn(),
    listActiveByCampaign: jest.fn().mockResolvedValue([]),
    ...repositoryOverrides,
  } as unknown as CampaignMembershipsRepository;
  const transactionManager = {
    inTransaction: jest.fn(async (work: (tx: AppDatabase) => Promise<unknown>) =>
      work({} as AppDatabase),
    ),
  } as unknown as TransactionManager;
  const campaignsService = {
    findMembershipCampaign: jest.fn().mockResolvedValue({
      id: CAMPAIGN_ID,
      ownerUserId: OWNER_ID,
      rulesetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }),
    lockCampaign: jest.fn(),
    trackedMembership: {},
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

  const scope = {
    tx: {} as AppDatabase,
    change: jest.fn(async (_entity, _id, build: () => { set: Record<string, unknown> }) => ({
      row: activeMember({ ...build().set, version: 2 }),
      changed: true,
      merged: [],
    })),
  } as unknown as ActionScope;
  const runAction = jest.fn(
    async (meta: ActionMeta<unknown>, work: (actionScope: ActionScope) => Promise<unknown>) => {
      await meta.authorize(scope.tx);

      return work(scope);
    },
  );
  const history = { runAction } as unknown as HistoryPort;

  const service = new CampaignMembershipsService(
    {} as AppDatabase,
    transactionManager,
    repository,
    campaignsService,
    usersDependencies,
  );

  return {
    listUseCase: new ListCampaignMembersUseCase(service),
    updateUseCase: new UpdateCampaignMemberUseCase(history, service),
    deleteUseCase: new DeleteCampaignMemberUseCase(history, service),
    permissionsUseCase: new GetMyCampaignPermissionsUseCase(service),
    repository,
    campaignsService,
    runAction,
    scope,
    usersDependencies,
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

describe("campaign membership use cases", () => {
  it("returns the full member view to active editors", async () => {
    const member = activeMember();
    const { listUseCase } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(member),
      listActiveByCampaign: jest.fn().mockResolvedValue([member]),
    });

    await expect(listUseCase.execute(memberContext, CAMPAIGN_ID)).resolves.toEqual({
      data: [
        {
          id: MEMBERSHIP_ID,
          userTag: "member#000001",
          displayName: "Member",
          role: "EDITOR",
          status: "ACTIVE",
          joinedAt: member.joinedAt.toISOString(),
          version: 1,
        },
      ],
      pageInfo: { limit: 1, nextCursor: null, total: 1 },
    });
  });

  it("returns the reduced member view to players", async () => {
    const member = activeMember({ role: "PLAYER" });
    const { listUseCase } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(member),
      listActiveByCampaign: jest.fn().mockResolvedValue([member]),
    });

    await expect(listUseCase.execute(memberContext, CAMPAIGN_ID)).resolves.toEqual({
      data: [
        {
          id: MEMBERSHIP_ID,
          userTag: "member#000001",
          displayName: "Member",
          role: "PLAYER",
        },
      ],
      pageInfo: { limit: 1, nextCursor: null, total: 1 },
    });
  });

  it("reports only permissions an editor can use", async () => {
    const { permissionsUseCase } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember()),
    });

    await expect(permissionsUseCase.execute(memberContext, CAMPAIGN_ID)).resolves.toEqual({
      permissions: ["campaignMembers.read", "campaignMembers.updateRole", "campaignMembers.revoke"],
    });
  });

  it("resolves the actor before opening the transaction", async () => {
    const { updateUseCase, runAction, usersDependencies } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember()),
      findById: jest.fn().mockResolvedValue(activeMember({ role: "PLAYER" })),
    });

    await updateUseCase.execute(memberContext, {
      campaignId: CAMPAIGN_ID,
      memberId: MEMBERSHIP_ID,
      command: { role: "EDITOR", expectedVersion: 1 },
    });

    expect(
      (usersDependencies.useCases.getOneUserBy.execute as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(runAction.mock.invocationCallOrder[0]!);
  });

  it("hides a campaign from non-members", async () => {
    const { listUseCase } = createUseCases();

    await expect(listUseCase.execute(memberContext, CAMPAIGN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("prevents demoting the campaign owner", async () => {
    const ownerMembership = activeMember({ userId: OWNER_ID });
    const { updateUseCase, scope } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(ownerMembership),
      findById: jest.fn().mockResolvedValue(ownerMembership),
    });

    await expect(
      updateUseCase.execute(ownerContext, {
        campaignId: CAMPAIGN_ID,
        memberId: MEMBERSHIP_ID,
        command: { role: "PLAYER", expectedVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(scope.change).not.toHaveBeenCalled();
  });

  it("locks the campaign before checking management access", async () => {
    const lockCampaign = jest.fn();
    const findCampaign = jest.fn().mockResolvedValue({
      id: CAMPAIGN_ID,
      ownerUserId: OWNER_ID,
      rulesetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });
    const { updateUseCase, scope } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(activeMember({ role: "PLAYER" })),
    }, {
      lockCampaign,
      findMembershipCampaign: findCampaign,
    });

    await updateUseCase.execute(ownerContext, {
      campaignId: CAMPAIGN_ID,
      memberId: MEMBERSHIP_ID,
      command: { role: "EDITOR", expectedVersion: 1 },
    });

    expect(lockCampaign.mock.invocationCallOrder[0]).toBeLessThan(
      findCampaign.mock.invocationCallOrder[0]!,
    );
    expect(scope.change).toHaveBeenCalled();
  });

  it("prevents revoking the last active editor", async () => {
    const { deleteUseCase, scope } = createUseCases({
      findActiveByUser: jest.fn().mockResolvedValue(activeMember()),
      findById: jest.fn().mockResolvedValue(activeMember()),
      countActiveEditors: jest.fn().mockResolvedValue(1),
    });

    await expect(
      deleteUseCase.execute(memberContext, { campaignId: CAMPAIGN_ID, memberId: MEMBERSHIP_ID }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(scope.change).not.toHaveBeenCalled();
  });
});
