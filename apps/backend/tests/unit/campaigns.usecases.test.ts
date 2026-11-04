import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import type { RulesetModuleDependencies } from "#src/modules/ruleset/index";
import type { UsersModuleDependencies } from "#src/modules/users/index";
import type {
  CampaignAggregate,
  CampaignRow,
  CampaignsRepository,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
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
    userLookup.dependencies,
    {} as RulesetModuleDependencies,
  );
}

function createUsersDependencies(existingUserIds: string[] = [OWNER_ID, OTHER_ID, ADMIN_ID]): {
  dependencies: UsersModuleDependencies;
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
    execute,
  };
}

const ownerContext: RequestContext = {
  actorId: OWNER_ID,
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

      expect(result.pageInfo.total).toBe(1);
      expect(result.data).toHaveLength(1);
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

      expect(result.pageInfo.total).toBe(1);
      expect(result.data).toHaveLength(1);
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

      expect(result.pageInfo.total).toBe(1);
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
});
