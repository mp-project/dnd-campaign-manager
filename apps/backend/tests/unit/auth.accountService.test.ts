import type { IdentityPort } from "#core/auth/identity";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type {
  AccountRepository,
  AccountRow,
} from "#src/modules/auth/domain/repository/AccountRepository";
import { AccountService } from "#src/modules/auth/service/AccountService";

const EXTERNAL_ID = "user_parallel";

const winner = {
  id: "00000000-0000-4000-8000-000000000001",
  clerkUserId: EXTERNAL_ID,
  email: "parallel@example.test",
  status: "ACTIVE",
  systemRole: "USER",
} as AccountRow;

describe("AccountService", () => {
  it("takes the account a parallel first request committed between its two lookups", async () => {
    // Not there by identity yet (the parallel request hadn't committed), but by address afterwards.
    const repository = {
      findByClerkUserId: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(winner),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as AccountRepository;
    const identityPort = {
      loadUser: jest.fn().mockResolvedValue({
        externalUserId: EXTERNAL_ID,
        email: winner.email,
        emailVerified: true,
        displayName: null,
        locale: null,
        timezone: null,
      }),
    } as unknown as IdentityPort;
    const transactionManager = {
      inTransaction: (work: (tx: AppDatabase) => Promise<unknown>) => work({} as AppDatabase),
    } as unknown as TransactionManager;
    const service = new AccountService(
      {} as AppDatabase,
      transactionManager,
      repository,
      identityPort,
      { bootstrapMaintainerEmail: undefined },
    );

    await expect(
      service.resolveActor({ externalUserId: EXTERNAL_ID, sessionId: "sess_1" }),
    ).resolves.toEqual({ actorId: winner.id, systemRole: "USER" });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
});
