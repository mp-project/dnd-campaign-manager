import { NotFoundError } from "#core/error/http/index";
import type { HistoryPort } from "#core/history/types";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CreateCampaignUseCase } from "#src/modules/campaigns/useCase/CreateCampaignUseCase";
import type { RulesetModuleDependencies } from "#src/modules/ruleset/index";
import type { UsersModuleDependencies } from "#src/modules/users/index";
import { GetCampaignByIdUseCase } from "#src/modules/campaigns/useCase/GetCampaignByIdUseCase";

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

    const useCase = new CreateCampaignUseCase({} as HistoryPort, service);

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
