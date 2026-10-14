import { createHash } from "node:crypto";

import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import type { CampaignInvitationRow } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
import type { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

const CAMPAIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAYER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INVITATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBERSHIP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function buildInvitation(overrides: Partial<CampaignInvitationRow> = {}): CampaignInvitationRow {
  const now = new Date();

  return {
    id: INVITATION_ID,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    campaignId: CAMPAIGN_ID,
    email: "player@example.test",
    targetUserId: PLAYER_ID,
    role: "PLAYER",
    tokenHash: "stored-token-hash",
    status: "PENDING",
    expiresAt: new Date(now.getTime() + 86_400_000),
    invitedBy: OWNER_ID,
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function createHarness(input: {
  actor?: { id: string; email: string; emailVerifiedAt: Date | null };
  targetByTag?: {
    id: string;
    userTag: string;
    email: string;
    displayName: string;
    status: "ACTIVE" | "LOCKED" | "DISABLED";
  } | null;
  campaignOwnerId?: string;
  invitation?: CampaignInvitationRow;
} = {}) {
  const db = {} as AppDatabase;
  const transactionManager: TransactionManager = {
    inTransaction: async (work) => work(db),
  };
  const invitation = input.invitation ?? buildInvitation();
  const repository = {
    expirePending: jest.fn(async () => undefined),
    findPendingByCampaignEmail: jest.fn(async () => null),
    create: jest.fn(async () => invitation),
    listPendingByCampaign: jest.fn(async () => [invitation]),
    listPendingForUser: jest.fn(async () => [invitation]),
    findByTokenHashForUpdate: jest.fn(async () => invitation),
    markAccepted: jest.fn(async () => buildInvitation({ status: "ACCEPTED", acceptedBy: PLAYER_ID, acceptedAt: new Date() })),
    markRevoked: jest.fn(async () => invitation),
  } as unknown as CampaignInvitationsRepository;
  const actor = input.actor ?? {
    id: OWNER_ID,
    email: "owner@example.test",
    emailVerifiedAt: new Date(),
  };
  const usersDependencies = {
    service: {
      getOneByUserTag: jest.fn(async () => input.targetByTag ?? null),
      getOneBy: jest.fn(async (query: { email: string } | { userId: string }) => {
        if ("userId" in query) {
          return actor;
        }

        return null;
      }),
      listPublicSummaries: jest.fn(async () => []),
    },
    useCases: {
      getOneUserBy: {
        execute: jest.fn(async () => actor),
      },
    },
  } as unknown as UsersModuleDependencies;
  const campaignsService = {
    findMembershipCampaign: jest.fn(async () => ({
      id: CAMPAIGN_ID,
      ownerUserId: input.campaignOwnerId ?? OWNER_ID,
      rulesetId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    })),
  } as unknown as CampaignsService;
  const membershipsService = {
    getActiveByUser: jest.fn(async () => null),
    createActiveFromInvitation: jest.fn(async () => ({
      id: MEMBERSHIP_ID,
      role: "PLAYER",
    })),
  } as unknown as CampaignMembershipsService;
  const emailPort = {
    send: jest.fn(async (message: { to: string; subject: string; text: string }) => {
      void message.text;
    }),
  };
  const service = new CampaignInvitationsService(
    db,
    transactionManager,
    repository,
    campaignsService,
    membershipsService,
    usersDependencies,
    emailPort,
    "https://app.example.test",
  );

  return { db, repository, usersDependencies, membershipsService, emailPort, service };
}

const ownerContext = { actorId: OWNER_ID, systemRole: "USER" as const };

describe("CampaignInvitationsService", () => {
  it("creates an owner invitation and emails a one-time token link without returning the token", async () => {
    const { service, repository, emailPort } = createHarness();

    const result = await service.invite(ownerContext, CAMPAIGN_ID, {
      email: "player@example.test",
      role: "PLAYER",
      expiresInDays: 7,
    });

    expect(result).toMatchObject({ id: INVITATION_ID, role: "PLAYER", status: "PENDING" });
    expect(result).not.toHaveProperty("token");
    expect(repository.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "player@example.test", targetUserId: null }),
    );
    const emailText = emailPort.send.mock.calls[0]?.[0].text;
    const token = emailText?.match(/#token=([A-Za-z0-9_-]+)/)?.[1];

    expect(token).toBeDefined();
    expect(emailText).toContain("/invitations/accept#token=");
    expect(repository.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokenHash: createHash("sha256").update(token ?? "").digest("hex"),
      }),
    );
  });

  it("does not allow an editor/non-owner to invite", async () => {
    const { service, repository, emailPort } = createHarness({
      campaignOwnerId: PLAYER_ID,
    });

    await expect(
      service.invite(ownerContext, CAMPAIGN_ID, {
        email: "player@example.test",
        role: "PLAYER",
        expiresInDays: 7,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
    expect(emailPort.send).not.toHaveBeenCalled();
  });

  it("looks up active users by userTag without exposing userId or email", async () => {
    const { service } = createHarness({
      targetByTag: {
        id: PLAYER_ID,
        userTag: "player#123456",
        email: "player@example.test",
        displayName: "Player",
        status: "ACTIVE",
      },
    });

    await expect(
      service.lookupUserTag(ownerContext, CAMPAIGN_ID, "player#123456"),
    ).resolves.toEqual({
      userTag: "player#123456",
      displayName: "Player",
    });
  });

  it("accepts an invitation only for the authenticated verified email", async () => {
    const invitation = buildInvitation();
    const { service, repository, membershipsService } = createHarness({
      invitation,
      actor: {
        id: PLAYER_ID,
        email: "player@example.test",
        emailVerifiedAt: new Date(),
      },
    });
    const rawToken = "a".repeat(43);
    (repository.findByTokenHashForUpdate as jest.Mock).mockResolvedValue(invitation);

    const result = await service.accept(
      { actorId: PLAYER_ID, systemRole: "USER" },
      rawToken,
    );

    expect(repository.findByTokenHashForUpdate).toHaveBeenCalledWith(
      expect.anything(),
      createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(membershipsService.createActiveFromInvitation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ campaignId: CAMPAIGN_ID, userId: PLAYER_ID, role: "PLAYER" }),
    );
    expect(result).toEqual({
      campaignId: CAMPAIGN_ID,
      membershipId: MEMBERSHIP_ID,
      role: "PLAYER",
    });
  });

  it("rejects an invitation when the authenticated email does not match", async () => {
    const { service, membershipsService } = createHarness({
      actor: {
        id: PLAYER_ID,
        email: "different@example.test",
        emailVerifiedAt: new Date(),
      },
      invitation: buildInvitation({ targetUserId: null }),
    });

    await expect(
      service.accept({ actorId: PLAYER_ID, systemRole: "USER" }, "a".repeat(43)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
  });

  it("marks an expired invitation before returning a conflict", async () => {
    const { service, repository, membershipsService } = createHarness({
      invitation: buildInvitation({ expiresAt: new Date(Date.now() - 1) }),
    });

    await expect(
      service.accept({ actorId: PLAYER_ID, systemRole: "USER" }, "a".repeat(43)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.expirePending).toHaveBeenCalled();
    expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
  });
});