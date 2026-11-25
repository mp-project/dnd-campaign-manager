import type { IdentityPort } from "#core/auth/identity";
import { MemoryCacheStore } from "#core/cache/memoryCacheStore";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type {
  AccountRepository,
  AccountRow,
} from "#src/modules/auth/domain/repository/AccountRepository";
import { InvalidateAccountCacheHandler } from "#src/modules/auth/events/InvalidateAccountCacheHandler";
import { AccountCache } from "#src/modules/auth/service/AccountCache";
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
      new AccountCache(new MemoryCacheStore()),
      { bootstrapMaintainerEmail: undefined },
    );

    await expect(
      service.resolveActor({ externalUserId: EXTERNAL_ID, sessionId: "sess_1" }),
    ).resolves.toEqual({ actorId: winner.id, systemRole: "USER" });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  describe("account cache", () => {
    const identity = { externalUserId: EXTERNAL_ID, sessionId: "sess_1" };
    const transactionManager = {
      inTransaction: (work: (tx: AppDatabase) => Promise<unknown>) => work({} as AppDatabase),
    } as unknown as TransactionManager;

    function setup(account: AccountRow | null, identityPort?: IdentityPort) {
      const repository = {
        findByClerkUserId: jest.fn().mockResolvedValue(account),
        findByEmail: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(account),
      } as unknown as AccountRepository;
      const cache = new AccountCache(new MemoryCacheStore());
      const service = new AccountService(
        {} as AppDatabase,
        transactionManager,
        repository,
        identityPort,
        cache,
        { bootstrapMaintainerEmail: undefined },
      );

      return { repository, cache, service };
    }

    it("answers a known account's next request without a query", async () => {
      const { repository, service } = setup(winner);

      await service.resolveActor(identity);

      await expect(service.resolveActor(identity)).resolves.toEqual({
        actorId: winner.id,
        systemRole: "USER",
      });
      expect(repository.findByClerkUserId).toHaveBeenCalledTimes(1);
    });

    it("keeps refusing a cached account that is not active", async () => {
      const { repository, service } = setup({ ...winner, status: "DISABLED" } as AccountRow);

      await expect(service.resolveActor(identity)).resolves.toBeNull();
      await expect(service.resolveActor(identity)).resolves.toBeNull();
      expect(repository.findByClerkUserId).toHaveBeenCalledTimes(1);
    });

    it("caches no identity without an account, so its next request can still create it", async () => {
      const { cache, service } = setup(null);

      await expect(service.resolveActor(identity)).resolves.toBeNull();
      await expect(cache.get(EXTERNAL_ID)).resolves.toBeUndefined();
    });

    it("drops the entry when the provider deletes the user", async () => {
      const { repository, service } = setup(winner);

      await service.resolveActor(identity);
      await service.markDeleted(EXTERNAL_ID);
      (repository.findByClerkUserId as jest.Mock).mockResolvedValue(null);

      await expect(service.resolveActor(identity)).resolves.toBeNull();
    });

    it("drops the entry after a tracked change of the user", async () => {
      const { repository, cache, service } = setup(winner);

      await service.resolveActor(identity);
      (repository.findByClerkUserId as jest.Mock).mockResolvedValue({
        ...winner,
        systemRole: "ADMIN",
      });

      await new InvalidateAccountCacheHandler(cache).handle({
        id: "event_1",
        name: "history.user.changed",
        occurredAt: new Date(),
        campaignId: null,
        actorId: null,
        payload: {
          eventId: "event_1",
          actionId: "action_1",
          action: "user.update",
          entityType: "user",
          entityId: winner.id,
          entityVersion: 2,
          campaignId: null,
          actorId: null,
          fields: ["systemRole"],
        },
      });

      await expect(service.resolveActor(identity)).resolves.toEqual({
        actorId: winner.id,
        systemRole: "ADMIN",
      });
    });
  });
});
