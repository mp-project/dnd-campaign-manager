import { createHash } from "node:crypto";

import { ConflictError, ForbiddenError, NotFoundError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionMeta, ActionScope, HistoryPort } from "#core/history/types";
import type { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import type { CampaignInvitationRow } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
import { AcceptCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/AcceptCampaignInvitationUseCase";
import { AcceptMyCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/AcceptMyCampaignInvitationUseCase";
import { DeclineMyCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/DeclineMyCampaignInvitationUseCase";
import { ListMyCampaignInvitationsUseCase } from "#src/modules/campaign-invitations/useCase/ListMyCampaignInvitationsUseCase";
import { CreateCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/CreateCampaignInvitationUseCase";
import { LookupCampaignInvitationTargetUseCase } from "#src/modules/campaign-invitations/useCase/LookupCampaignInvitationTargetUseCase";
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
    updateExpired: jest.fn(async () => undefined),
    findPendingByCampaignTarget: jest.fn(async () => null),
    create: jest.fn(async () => invitation),
    listPendingByCampaign: jest.fn(async () => [invitation]),
    listPendingForUser: jest.fn(async () => [invitation]),
    findByTokenHashForUpdate: jest.fn(async () => invitation),
    findByIdForUpdate: jest.fn(async (_db: AppDatabase, id: string) => (id === invitation.id ? invitation : null)),
    revokeOtherPendingForAccount: jest.fn(async () => undefined),
    updateStatus: jest.fn(async (_db: AppDatabase, change: { status: string }) =>
      buildInvitation({ status: change.status as CampaignInvitationRow["status"], acceptedBy: PLAYER_ID, acceptedAt: new Date() }),
    ),
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
      listPublicSummaries: jest.fn(async (ids: string[]) =>
        ids.includes(OWNER_ID) ? [{ id: OWNER_ID, userTag: "spielleitung#000001", displayName: "Mira Falkenstein" }] : [],
      ),
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
      name: "Die Schatten von Elaria",
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
  const history = {
    runAction: async (meta: ActionMeta<unknown>, work: (scope: ActionScope) => Promise<unknown>) => {
      await meta.authorize(db);

      return work({ tx: db } as ActionScope);
    },
  } as unknown as HistoryPort;
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

  return {
    db,
    repository,
    usersDependencies,
    membershipsService,
    emailPort,
    createUseCase: new CreateCampaignInvitationUseCase(service),
    lookupUseCase: new LookupCampaignInvitationTargetUseCase(service),
    acceptUseCase: new AcceptCampaignInvitationUseCase(history, service),
    listMyUseCase: new ListMyCampaignInvitationsUseCase(service),
    acceptMyUseCase: new AcceptMyCampaignInvitationUseCase(history, service),
    declineMyUseCase: new DeclineMyCampaignInvitationUseCase(service),
  };
}

const ownerContext = { actorId: OWNER_ID, systemRole: "USER" as const };

describe("campaign invitation use cases", () => {
  it("creates an owner invitation and emails a one-time token link without returning the token", async () => {
    const { createUseCase, repository, emailPort } = createHarness();

    const result = await createUseCase.execute(ownerContext, CAMPAIGN_ID, {
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

  it("doesn't look up an account for an invitation by email, so the answer reveals none", async () => {
    const { createUseCase, repository, usersDependencies, membershipsService } = createHarness();

    const result = await createUseCase.execute(ownerContext, CAMPAIGN_ID, {
      email: "player@example.test",
      role: "PLAYER",
      expiresInDays: 7,
    });

    expect(usersDependencies.service.getOneBy).not.toHaveBeenCalledWith({ email: "player@example.test" });
    expect(membershipsService.getActiveByUser).not.toHaveBeenCalled();
    expect(repository.findPendingByCampaignTarget).toHaveBeenCalledWith(expect.anything(), CAMPAIGN_ID, { email: "player@example.test" });
    expect(repository.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetUserId: null }));
    expect(result.userTag).toBeNull();
  });

  it("invites an account by its user tag without showing its address", async () => {
    const { createUseCase, repository } = createHarness({
      targetByTag: { id: PLAYER_ID, userTag: "jonas#000002", email: "player@example.test", displayName: "Jonas", status: "ACTIVE" },
    });
    (repository.create as jest.Mock).mockResolvedValue(buildInvitation({ targetUserId: PLAYER_ID }));

    const result = await createUseCase.execute(ownerContext, CAMPAIGN_ID, {
      userTag: "jonas#000002",
      role: "PLAYER",
      expiresInDays: 7,
    });

    expect(repository.findPendingByCampaignTarget).toHaveBeenCalledWith(expect.anything(), CAMPAIGN_ID, { targetUserId: PLAYER_ID });
    expect(repository.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetUserId: PLAYER_ID }));
    expect(result).toMatchObject({ userTag: "jonas#000002", email: null });
  });

  it("does not allow an editor/non-owner to invite", async () => {
    const { createUseCase, repository, emailPort } = createHarness({
      campaignOwnerId: PLAYER_ID,
    });

    await expect(
      createUseCase.execute(ownerContext, CAMPAIGN_ID, {
        email: "player@example.test",
        role: "PLAYER",
        expiresInDays: 7,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
    expect(emailPort.send).not.toHaveBeenCalled();
  });

  it("looks up active users by userTag without exposing userId or email", async () => {
    const { lookupUseCase } = createHarness({
      targetByTag: {
        id: PLAYER_ID,
        userTag: "player#123456",
        email: "player@example.test",
        displayName: "Player",
        status: "ACTIVE",
      },
    });

    await expect(
      lookupUseCase.execute(ownerContext, CAMPAIGN_ID, "player#123456"),
    ).resolves.toEqual({
      userTag: "player#123456",
      displayName: "Player",
    });
  });

  it("accepts an invitation only for the authenticated verified email", async () => {
    const invitation = buildInvitation();
    const { acceptUseCase, repository, membershipsService } = createHarness({
      invitation,
      actor: {
        id: PLAYER_ID,
        email: "player@example.test",
        emailVerifiedAt: new Date(),
      },
    });
    const rawToken = "a".repeat(43);
    (repository.findByTokenHashForUpdate as jest.Mock).mockResolvedValue(invitation);

    const result = await acceptUseCase.execute(
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
    const { acceptUseCase, membershipsService } = createHarness({
      actor: {
        id: PLAYER_ID,
        email: "different@example.test",
        emailVerifiedAt: new Date(),
      },
      invitation: buildInvitation({ targetUserId: null }),
    });

    await expect(
      acceptUseCase.execute({ actorId: PLAYER_ID, systemRole: "USER" }, "a".repeat(43)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
  });

  it("marks an expired invitation before returning a conflict", async () => {
    const { acceptUseCase, repository, membershipsService } = createHarness({
      actor: { id: PLAYER_ID, email: "player@example.test", emailVerifiedAt: new Date() },
      invitation: buildInvitation({ expiresAt: new Date(Date.now() - 1) }),
    });

    await expect(
      acceptUseCase.execute({ actorId: PLAYER_ID, systemRole: "USER" }, "a".repeat(43)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.updateExpired).toHaveBeenCalled();
    expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
  });

  describe("the account's own invitations", () => {
    const player = { id: PLAYER_ID, email: "player@example.test", emailVerifiedAt: new Date() };
    const playerContext = { actorId: PLAYER_ID, systemRole: "USER" as const };

    it("lists them with the campaign's name and who invited", async () => {
      const invitation = buildInvitation();
      const { listMyUseCase } = createHarness({ actor: player, invitation });

      await expect(listMyUseCase.execute(playerContext)).resolves.toEqual({
        data: [
          {
            invitationId: INVITATION_ID,
            campaignId: CAMPAIGN_ID,
            campaignName: "Die Schatten von Elaria",
            invitedByName: "Mira Falkenstein",
            role: "PLAYER",
            expiresAt: invitation.expiresAt.toISOString(),
            createdAt: invitation.createdAt.toISOString(),
          },
        ],
      });
    });

    it("accepts one by its id, with the same checks as the token", async () => {
      const { acceptMyUseCase, repository, membershipsService } = createHarness({ actor: player });

      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).resolves.toEqual({
        campaignId: CAMPAIGN_ID,
        membershipId: MEMBERSHIP_ID,
        role: "PLAYER",
      });
      expect(repository.findByIdForUpdate).toHaveBeenCalledWith(expect.anything(), INVITATION_ID);
      expect(membershipsService.createActiveFromInvitation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ campaignId: CAMPAIGN_ID, userId: PLAYER_ID, role: "PLAYER" }),
      );
    });

    it("doesn't accept someone else's invitation by its id", async () => {
      const stranger = { id: OWNER_ID, email: "owner@example.test", emailVerifiedAt: new Date() };
      const { acceptMyUseCase, membershipsService } = createHarness({ actor: stranger });

      await expect(
        acceptMyUseCase.execute({ actorId: OWNER_ID, systemRole: "USER" }, INVITATION_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        acceptMyUseCase.execute(playerContext, "99999999-9999-4999-8999-999999999999"),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
    });

    it("declines one: it ends like a revoked invitation, by the invited account", async () => {
      const { declineMyUseCase, repository } = createHarness({ actor: player });

      await expect(declineMyUseCase.execute(playerContext, INVITATION_ID)).resolves.toBeUndefined();
      expect(repository.updateStatus).toHaveBeenCalledWith(expect.anything(), {
        status: "REVOKED",
        campaignId: CAMPAIGN_ID,
        invitationId: INVITATION_ID,
        actorId: PLAYER_ID,
        now: expect.any(Date),
      });
    });

    it("declines an address invitation only once the address is verified", async () => {
      const unverified = { ...player, emailVerifiedAt: null };
      const { declineMyUseCase, repository } = createHarness({
        actor: unverified,
        invitation: buildInvitation({ targetUserId: null }),
      });

      await expect(declineMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it.each([
      ["expired", buildInvitation({ expiresAt: new Date(Date.now() - 1) })],
      ["expired", buildInvitation({ status: "EXPIRED" })],
      ["changed", buildInvitation({ status: "REVOKED" })],
      ["changed", buildInvitation({ status: "ACCEPTED", acceptedBy: OWNER_ID })],
    ])("says why an own invitation can't be answered any more: %s", async (reason, invitation) => {
      const { acceptMyUseCase, declineMyUseCase, repository } = createHarness({ actor: player, invitation });

      await expect(declineMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toMatchObject({ statusCode: 409, details: { reason } });
      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toMatchObject({ statusCode: 409, details: { reason } });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it("lets an account accept an invitation by its user tag also after changing its address", async () => {
      const changed = { ...player, email: "new-address@example.test" };
      const { acceptMyUseCase, membershipsService } = createHarness({
        actor: changed,
        invitation: buildInvitation({ email: "player@example.test", targetUserId: PLAYER_ID }),
      });

      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).resolves.toMatchObject({ campaignId: CAMPAIGN_ID });
      expect(membershipsService.createActiveFromInvitation).toHaveBeenCalled();
    });

    it("gives an invitation by user tag only to that account, not to whoever has its old address now", async () => {
      const newOwnerOfAddress = { id: OWNER_ID, email: "player@example.test", emailVerifiedAt: new Date() };
      const { acceptMyUseCase, declineMyUseCase, membershipsService, repository } = createHarness({
        actor: newOwnerOfAddress,
        invitation: buildInvitation({ email: "player@example.test", targetUserId: PLAYER_ID }),
      });
      const context = { actorId: OWNER_ID, systemRole: "USER" as const };

      await expect(acceptMyUseCase.execute(context, INVITATION_ID)).rejects.toBeInstanceOf(NotFoundError);
      await expect(declineMyUseCase.execute(context, INVITATION_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it("answers 404 for a foreign invitation before looking at its expiry, and writes nothing", async () => {
      const stranger = { id: OWNER_ID, email: "owner@example.test", emailVerifiedAt: new Date() };
      const { acceptMyUseCase, repository } = createHarness({
        actor: stranger,
        invitation: buildInvitation({ expiresAt: new Date(Date.now() - 1) }),
      });

      await expect(
        acceptMyUseCase.execute({ actorId: OWNER_ID, systemRole: "USER" }, INVITATION_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.updateExpired).not.toHaveBeenCalled();
    });

    it("says why an own invitation can't be accepted: expired", async () => {
      const { acceptMyUseCase } = createHarness({
        actor: player,
        invitation: buildInvitation({ expiresAt: new Date(Date.now() - 1) }),
      });

      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toMatchObject({
        details: { reason: "expired" },
      });
    });

    it("needs a verified address to accept", async () => {
      const { acceptMyUseCase, repository } = createHarness({ actor: { ...player, emailVerifiedAt: null } });

      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toMatchObject({ details: { reason: "unverified" } });
      expect(repository.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it("uses up the account's other pending invitations to the campaign once it joined", async () => {
      const { acceptMyUseCase, repository } = createHarness({ actor: player });

      await acceptMyUseCase.execute(playerContext, INVITATION_ID);
      expect(repository.revokeOtherPendingForAccount).toHaveBeenCalledWith(expect.anything(), {
        campaignId: CAMPAIGN_ID,
        exceptInvitationId: INVITATION_ID,
        userId: PLAYER_ID,
        email: "player@example.test",
        now: expect.any(Date),
      });
    });

    it("ends an invitation a member accepts, without a new membership", async () => {
      const { acceptMyUseCase, repository, membershipsService } = createHarness({ actor: player });
      (membershipsService.getActiveByUser as jest.Mock).mockResolvedValue({ id: MEMBERSHIP_ID, role: "PLAYER" });

      await expect(acceptMyUseCase.execute(playerContext, INVITATION_ID)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "member" },
      });
      expect(repository.updateStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "REVOKED", invitationId: INVITATION_ID }));
      expect(membershipsService.createActiveFromInvitation).not.toHaveBeenCalled();
    });

    it("leaves invitations to campaigns the account belongs to out of its list", async () => {
      const { listMyUseCase, membershipsService } = createHarness({ actor: player });
      (membershipsService.getActiveByUser as jest.Mock).mockResolvedValue({ id: MEMBERSHIP_ID, role: "PLAYER" });

      await expect(listMyUseCase.execute(playerContext)).resolves.toEqual({ data: [] });
    });
  });
});
