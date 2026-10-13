import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import type { UsersModuleDependencies } from "#src/modules/users/index";
import type {
  CampaignAggregate,
  CampaignRow,
  CampaignTimeEventRow,
  CampaignsRepository,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import { AdvanceCampaignTimeUseCase } from "#src/modules/campaigns/useCase/AdvanceCampaignTimeUseCase";
import { CorrectCampaignTimeUseCase } from "#src/modules/campaigns/useCase/CorrectCampaignTimeUseCase";
import { DeleteCampaignUseCase } from "#src/modules/campaigns/useCase/DeleteCampaignUseCase";
import { GetCampaignTimeHistoryUseCase } from "#src/modules/campaigns/useCase/GetCampaignTimeHistoryUseCase";
import { ListCampaignsUseCase } from "#src/modules/campaigns/useCase/ListCampaignsUseCase";

const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RULESET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";

function buildCampaign(overrides: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id: CAMPAIGN_ID,
    version: 3,
    ownerUserId: OWNER_ID,
    rulesetId: RULESET_ID,
    name: "North Reach",
    slug: "north-reach",
    description: null,
    status: "ACTIVE",
    currentGameDay: 10,
    longRestCount: 2,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    ...overrides,
  };
}

function buildTimeEvent(overrides: Partial<CampaignTimeEventRow> = {}): CampaignTimeEventRow {
  return {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    campaignId: CAMPAIGN_ID,
    type: "ADVANCE_DAYS",
    previousGameDay: 10,
    newGameDay: 12,
    previousLongRestCount: 2,
    newLongRestCount: 2,
    reason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    ...overrides,
  };
}

function buildAggregate(overrides: Partial<CampaignAggregate> = {}): CampaignAggregate {
  return {
    campaign: buildCampaign(),
    membership: null,
    isOwner: true,
    effectivePermissions: [],
    ...overrides,
  };
}

function createService(
  repository: CampaignsRepository,
  transactionManager: TransactionManager = {
    inTransaction: async <T>(work: (db: AppDatabase) => Promise<T>) =>
      work({} as AppDatabase),
  },
  userLookup = createUsersDependencies(),
): CampaignsService {
  return new CampaignsService(
    {} as AppDatabase,
    transactionManager,
    repository,
    undefined,
    undefined,
    userLookup.dependencies,
    userLookup.campaignUserService,
  );
}

function createUsersDependencies(existingUserIds: string[] = [OWNER_ID, OTHER_ID, ADMIN_ID]): {
  dependencies: UsersModuleDependencies;
  campaignUserService: CampaignUserService;
  execute: jest.Mock;
} {
  const existing = new Set(existingUserIds);
  const execute = jest.fn(async ({ userId }: { userId: string }) =>
    existing.has(userId) ? ({ id: userId } as never) : null,
  );

  return {
    dependencies: {
      useCases: {
        getOneUserBy: {
          execute,
        },
      },
    } as unknown as UsersModuleDependencies,
    campaignUserService: new CampaignUserService({
      execute,
    } as never),
    execute,
  };
}

const ownerContext: RequestContext = {
  actorId: OWNER_ID,
  systemRole: "USER",
};

const editorContext: RequestContext = {
  actorId: OTHER_ID,
  systemRole: "USER",
};

const adminContext: RequestContext = {
  actorId: ADMIN_ID,
  systemRole: "ADMIN",
};

describe("campaign use cases", () => {
  describe("ListCampaignsUseCase", () => {
    it("returns actor campaigns and total", async () => {
      const aggregate = buildAggregate();
      const repository = {
        listForActor: jest.fn(async () => [aggregate]),
        countForActor: jest.fn(async () => 1),
      } as unknown as CampaignsRepository;

      const users = createUsersDependencies();
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      const result = await useCase.execute(ownerContext, {
        includeArchived: false,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(repository.listForActor).toHaveBeenCalledWith(
        service.db,
        OWNER_ID,
        expect.objectContaining({ includeArchived: false, limit: 20 }),
      );
      expect(repository.countForActor).toHaveBeenCalledWith(
        service.db,
        OWNER_ID,
        expect.objectContaining({ includeArchived: false, limit: 20 }),
      );
      expect(users.execute).toHaveBeenCalledWith({ userId: OWNER_ID });
    });

    it("allows admins to list campaigns for a provided userId", async () => {
      const aggregate = buildAggregate({ isOwner: false });
      const repository = {
        listForActor: jest.fn(async () => [aggregate]),
        countForActor: jest.fn(async () => 1),
      } as unknown as CampaignsRepository;

      const users = createUsersDependencies();
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      const result = await useCase.execute(adminContext, {
        includeArchived: false,
        limit: 20,
        userId: OWNER_ID,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(repository.listForActor).toHaveBeenCalledWith(
        service.db,
        OWNER_ID,
        expect.objectContaining({ includeArchived: false, limit: 20 }),
      );
      expect(repository.countForActor).toHaveBeenCalledWith(
        service.db,
        OWNER_ID,
        expect.objectContaining({ includeArchived: false, limit: 20 }),
      );
      expect(users.execute).toHaveBeenCalledWith({ userId: ADMIN_ID });
      expect(users.execute).toHaveBeenCalledWith({ userId: OWNER_ID });
    });

    it("denies non-admin users requesting campaigns of another userId", async () => {
      const repository = {
        listForActor: jest.fn(async () => []),
        countForActor: jest.fn(async () => 0),
      } as unknown as CampaignsRepository;
      const users = createUsersDependencies();
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      await expect(
        useCase.execute(ownerContext, {
          includeArchived: false,
          limit: 20,
          userId: OTHER_ID,
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });

      expect(repository.listForActor).not.toHaveBeenCalled();
      expect(repository.countForActor).not.toHaveBeenCalled();
      expect(users.execute).toHaveBeenCalledWith({ userId: OWNER_ID });
      expect(users.execute).toHaveBeenCalledWith({ userId: OTHER_ID });
    });

    it("allows users to query own campaigns explicitly via matching userId", async () => {
      const aggregate = buildAggregate();
      const repository = {
        listForActor: jest.fn(async () => [aggregate]),
        countForActor: jest.fn(async () => 1),
      } as unknown as CampaignsRepository;

      const users = createUsersDependencies();
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      const result = await useCase.execute(ownerContext, {
        includeArchived: false,
        limit: 20,
        userId: OWNER_ID,
      });

      expect(result.total).toBe(1);
      expect(repository.listForActor).toHaveBeenCalledWith(
        service.db,
        OWNER_ID,
        expect.objectContaining({ includeArchived: false, limit: 20 }),
      );
      expect(users.execute).toHaveBeenCalledTimes(2);
      expect(users.execute).toHaveBeenCalledWith({ userId: OWNER_ID });
    });

    it("returns unauthenticated when actor is missing", async () => {
      const repository = {} as CampaignsRepository;
      const service = createService(repository);
      const useCase = new ListCampaignsUseCase(service);

      await expect(
        useCase.execute(
          {
            actorId: null,
            systemRole: "USER",
          },
          {
            includeArchived: false,
            limit: 20,
          },
        ),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        statusCode: 401,
      });
    });

    it("returns unauthenticated when cookie actor user does not exist", async () => {
      const repository = {
        listForActor: jest.fn(async () => []),
        countForActor: jest.fn(async () => 0),
      } as unknown as CampaignsRepository;
      const users = createUsersDependencies([OWNER_ID]);
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      await expect(
        useCase.execute(
          {
            actorId: ADMIN_ID,
            systemRole: "ADMIN",
          },
          {
            includeArchived: false,
            limit: 20,
          },
        ),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        statusCode: 401,
      });

      expect(repository.listForActor).not.toHaveBeenCalled();
      expect(repository.countForActor).not.toHaveBeenCalled();
    });

    it("returns not found when requested userId does not exist", async () => {
      const repository = {
        listForActor: jest.fn(async () => []),
        countForActor: jest.fn(async () => 0),
      } as unknown as CampaignsRepository;
      const users = createUsersDependencies([ADMIN_ID]);
      const service = createService(repository, undefined, users);
      const useCase = new ListCampaignsUseCase(service);

      await expect(
        useCase.execute(adminContext, {
          includeArchived: false,
          limit: 20,
          userId: OWNER_ID,
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });

      expect(repository.listForActor).not.toHaveBeenCalled();
      expect(repository.countForActor).not.toHaveBeenCalled();
    });
  });

  describe("DeleteCampaignUseCase", () => {
    it("archives a campaign with current version", async () => {
      const current = buildCampaign({ version: 7 });
      const repository = {
        findCampaignById: jest.fn(async () => current),
        findMembership: jest.fn(async () => null),
        softArchiveWithVersion: jest.fn(async () =>
          buildCampaign({ status: "ARCHIVED", version: 8 }),
        ),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new DeleteCampaignUseCase(service);

      await useCase.execute(ownerContext, CAMPAIGN_ID);

      expect(repository.softArchiveWithVersion).toHaveBeenCalledWith(service.db, {
        campaignId: CAMPAIGN_ID,
        actorId: OWNER_ID,
        expectedVersion: 7,
      });
    });

    it("returns not found when campaign does not exist", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new DeleteCampaignUseCase(service);

      await expect(useCase.execute(ownerContext, CAMPAIGN_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });
    });

    it("returns version conflict when archive update misses expected version", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ version: 2 })),
        findMembership: jest.fn(async () => null),
        softArchiveWithVersion: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new DeleteCampaignUseCase(service);

      await expect(useCase.execute(ownerContext, CAMPAIGN_ID)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        statusCode: 412,
      });
    });
  });

  describe("AdvanceCampaignTimeUseCase", () => {
    it("updates time and stores LONG_REST event", async () => {
      const current = buildCampaign({ currentGameDay: 10, longRestCount: 2, version: 4 });
      const updated = buildCampaign({ currentGameDay: 10, longRestCount: 3, version: 5 });
      const repository = {
        findCampaignById: jest.fn(async () => current),
        findMembership: jest.fn(async () => null),
        updateTimeWithVersion: jest.fn(async () => updated),
        insertTimeEvent: jest.fn(async () => buildTimeEvent({ type: "LONG_REST" })),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new AdvanceCampaignTimeUseCase(service);

      const result = await useCase.execute(ownerContext, CAMPAIGN_ID, {
        days: 0,
        longRests: 1,
        reason: null,
      });

      expect(result.campaign.currentGameDay).toBe(10);
      expect(result.campaign.longRestCount).toBe(3);
      expect(repository.updateTimeWithVersion).toHaveBeenCalledWith(service.db, {
        campaignId: CAMPAIGN_ID,
        actorId: OWNER_ID,
        expectedVersion: 4,
        newGameDay: 10,
        newLongRestCount: 3,
      });
      expect(repository.insertTimeEvent).toHaveBeenCalledWith(service.db, {
        actorId: OWNER_ID,
        campaignId: CAMPAIGN_ID,
        type: "LONG_REST",
        previousGameDay: 10,
        newGameDay: 10,
        previousLongRestCount: 2,
        newLongRestCount: 3,
        reason: null,
      });
    });

    it("returns conflict when campaign is archived", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ status: "ARCHIVED" })),
        findMembership: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new AdvanceCampaignTimeUseCase(service);

      await expect(
        useCase.execute(ownerContext, CAMPAIGN_ID, {
          days: 1,
          longRests: 0,
          reason: null,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        statusCode: 409,
      });
    });

    it("returns version conflict when time update misses expected version", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ version: 3 })),
        findMembership: jest.fn(async () => null),
        updateTimeWithVersion: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new AdvanceCampaignTimeUseCase(service);

      await expect(
        useCase.execute(ownerContext, CAMPAIGN_ID, {
          days: 1,
          longRests: 0,
          reason: null,
        }),
      ).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        statusCode: 412,
      });
    });
  });

  describe("CorrectCampaignTimeUseCase", () => {
    it("writes corrected absolute values and CORRECTION event", async () => {
      const current = buildCampaign({ ownerUserId: OWNER_ID, version: 5 });
      const updated = buildCampaign({ currentGameDay: 4, longRestCount: 1, version: 6 });
      const repository = {
        findCampaignById: jest.fn(async () => current),
        findMembership: jest.fn(async () => null),
        updateTimeWithVersion: jest.fn(async () => updated),
        insertTimeEvent: jest.fn(async () => buildTimeEvent({ type: "CORRECTION" })),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new CorrectCampaignTimeUseCase(service);

      const result = await useCase.execute(ownerContext, CAMPAIGN_ID, {
        gameDay: 4,
        longRestCount: 1,
        reason: "Session log correction",
      });

      expect(result.campaign.currentGameDay).toBe(4);
      expect(result.campaign.longRestCount).toBe(1);
      expect(repository.updateTimeWithVersion).toHaveBeenCalledWith(service.db, {
        campaignId: CAMPAIGN_ID,
        actorId: OWNER_ID,
        expectedVersion: 5,
        newGameDay: 4,
        newLongRestCount: 1,
      });
      expect(repository.insertTimeEvent).toHaveBeenCalledWith(service.db, {
        actorId: OWNER_ID,
        campaignId: CAMPAIGN_ID,
        type: "CORRECTION",
        previousGameDay: 10,
        newGameDay: 4,
        previousLongRestCount: 2,
        newLongRestCount: 1,
        reason: "Session log correction",
      });
    });

    it("returns not found when actor has no access", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ ownerUserId: OWNER_ID })),
        findMembership: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new CorrectCampaignTimeUseCase(service);

      await expect(
        useCase.execute(editorContext, CAMPAIGN_ID, {
          gameDay: 4,
          longRestCount: 1,
          reason: "Session log correction",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });
    });

    it("returns version conflict when correction update misses expected version", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ version: 9 })),
        findMembership: jest.fn(async () => null),
        updateTimeWithVersion: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new CorrectCampaignTimeUseCase(service);

      await expect(
        useCase.execute(ownerContext, CAMPAIGN_ID, {
          gameDay: 11,
          longRestCount: 3,
          reason: "Manual correction",
        }),
      ).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        statusCode: 412,
      });
    });
  });

  describe("GetCampaignTimeHistoryUseCase", () => {
    it("returns campaign time events for owner", async () => {
      const event = buildTimeEvent();
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ ownerUserId: OWNER_ID })),
        findMembership: jest.fn(async () => null),
        listTimeEvents: jest.fn(async () => [event]),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new GetCampaignTimeHistoryUseCase(service);

      const result = await useCase.execute(ownerContext, CAMPAIGN_ID, 20);

      expect(result).toEqual([event]);
      expect(repository.listTimeEvents).toHaveBeenCalledWith(service.db, CAMPAIGN_ID, 20);
    });

    it("returns not found when campaign does not exist", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new GetCampaignTimeHistoryUseCase(service);

      await expect(useCase.execute(ownerContext, CAMPAIGN_ID, 20)).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });
    });

    it("returns not found when actor is not owner and has no membership", async () => {
      const repository = {
        findCampaignById: jest.fn(async () => buildCampaign({ ownerUserId: OWNER_ID })),
        findMembership: jest.fn(async () => null),
      } as unknown as CampaignsRepository;

      const service = createService(repository);
      const useCase = new GetCampaignTimeHistoryUseCase(service);

      await expect(useCase.execute(editorContext, CAMPAIGN_ID, 20)).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });
    });
  });
});