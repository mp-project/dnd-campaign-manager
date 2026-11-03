import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CreateCampaignUseCase } from "#src/modules/campaigns/useCase/CreateCampaignUseCase";
import type { RulesetModuleDependencies } from "#src/modules/ruleset/index";
import type { UsersModuleDependencies } from "#src/modules/users/index";
import { GetCampaignByIdUseCase } from "#src/modules/campaigns/useCase/GetCampaignByIdUseCase";
import { UpdateCampaignUseCase } from "#src/modules/campaigns/useCase/UpdateCampaignUseCase";

function createService(tx: TransactionManager, repository: CampaignsRepository) {
  const usersDependencies = {
    useCases: {
      getOneUserBy: { execute: async ({ userId }: { userId: string }) => ({ id: userId }) },
    },
  } as unknown as UsersModuleDependencies;

  return new CampaignsService(
    {} as AppDatabase,
    tx,
    repository,
    usersDependencies,
    {} as RulesetModuleDependencies,
  );
}

describe("CampaignsService", () => {
  it("rejects unauthenticated create requests", async () => {
    const repository = {} as CampaignsRepository;
    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };

    const service = createService(tx, repository);

    const useCase = new CreateCampaignUseCase(service);

    await expect(
      useCase.execute(
        {
          actorId: null,
          systemRole: "USER",
        },
        {
          name: "My Campaign",
          slug: "my-campaign",
          description: null,
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      ),
    ).rejects.toThrow("Authentication required");
  });

  it("rejects archived campaign updates", async () => {
    const repository = {
      findById: jest.fn(async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        version: 3,
        ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rulesetId: "11111111-1111-4111-8111-111111111111",
        name: "Archived",
        slug: "archived",
        description: null,
        status: "ARCHIVED",
        currentGameDay: 10,
        longRestCount: 2,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: "00000000-0000-4000-8000-000000000001",
        updatedBy: null,
      })),
      findMembership: jest.fn(async () => ({
        id: "33333333-3333-4333-8333-333333333333",
        campaignId: "22222222-2222-4222-8222-222222222222",
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "EDITOR",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: "00000000-0000-4000-8000-000000000001",
        updatedBy: null,
      })),
    } as unknown as CampaignsRepository;

    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };

    const service = createService(tx, repository);

    const useCase = new UpdateCampaignUseCase(service);

    await expect(
      useCase.execute(
        {
          actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          systemRole: "USER",
        },
        "22222222-2222-4222-8222-222222222222",
        {
          expectedVersion: 3,
          name: "Still archived",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws not found for unknown campaigns", async () => {
    const repository = {
      findById: jest.fn(async () => null),
    } as unknown as CampaignsRepository;

    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };

    const service = createService(tx, repository);

    const useCase = new GetCampaignByIdUseCase(service);

    await expect(
      useCase.execute(
        {
          actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          systemRole: "USER",
        },
        "00000000-0000-4000-8000-000000000099",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
