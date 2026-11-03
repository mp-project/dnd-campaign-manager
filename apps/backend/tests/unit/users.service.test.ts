import { ConflictError, ForbiddenError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { UsersService } from "#src/modules/users/service/UsersService";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";
import { UpdateUserUseCase } from "#src/modules/users/useCase/UpdateUserUseCase";

function buildServiceWithRepository(repository: Partial<UsersRepository>) {
  const tx: TransactionManager = {
    inTransaction: async (work) => work({} as AppDatabase),
  };

  return new UsersService(
    {} as AppDatabase,
    tx,
    repository as UsersRepository,
  );
}

describe("users use cases", () => {
  it("rejects demoting the last active admin", async () => {
    const repository: Partial<UsersRepository> = {
      findById: jest.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
        email: "admin@example.test",
        passwordHash: "hash",
        displayName: "Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: null,
        lastLoginAt: null,
      }),
      countActiveAdmins: jest.fn().mockResolvedValue(1),
      update: jest.fn(),
    };

    const service = buildServiceWithRepository(repository);

    await expect(
      new UpdateUserUseCase(service).execute(
        { actorId: "super-admin-actor", systemRole: "SYSTEM_MAINTAINER" },
        "11111111-1111-4111-8111-111111111111",
        {
          expectedVersion: 1,
          systemRole: "USER",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("blocks ADMIN from managing ADMIN users", async () => {
    const repository: Partial<UsersRepository> = {
      findById: jest.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
        email: "admin@example.test",
        passwordHash: "hash",
        displayName: "Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: null,
        lastLoginAt: null,
      }),
    };

    const service = buildServiceWithRepository(repository);

    await expect(
      new UpdateUserUseCase(service).execute(
        { actorId: "admin-actor", systemRole: "ADMIN" },
        "11111111-1111-4111-8111-111111111111",
        {
          expectedVersion: 1,
          displayName: "Renamed Admin",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks elevated users from removing their own elevated role", async () => {
    const repository: Partial<UsersRepository> = {
      findById: jest.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
        email: "super-admin@example.test",
        passwordHash: "hash",
        displayName: "Super Admin",
        systemRole: "SYSTEM_MAINTAINER",
        status: "ACTIVE",
        emailVerifiedAt: null,
        lastLoginAt: null,
      }),
    };

    const service = buildServiceWithRepository(repository);

    await expect(
      new UpdateUserUseCase(service).execute(
        {
          actorId: "11111111-1111-4111-8111-111111111111",
          systemRole: "SYSTEM_MAINTAINER",
        },
        "11111111-1111-4111-8111-111111111111",
        {
          expectedVersion: 1,
          systemRole: "ADMIN",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("normalizes email for self updates", async () => {
    const updateProfile = jest.fn().mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
      email: "new.email@example.test",
      passwordHash: "hash",
      displayName: "User",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: null,
      lastLoginAt: null,
    });

    const repository: Partial<UsersRepository> = {
      findById: jest.fn().mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
        email: "old@example.test",
        passwordHash: "hash",
        displayName: "User",
        systemRole: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      }),
      isActiveEmailTaken: jest.fn().mockResolvedValue(false),
      updateProfile,
      findAggregate: jest.fn().mockResolvedValue({
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
          email: "new.email@example.test",
          passwordHash: "hash",
          displayName: "User",
          systemRole: "USER",
          status: "ACTIVE",
          emailVerifiedAt: null,
          lastLoginAt: null,
        },
        settings: {
          id: "33333333-3333-4333-8333-333333333333",
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
          userId: "22222222-2222-4222-8222-222222222222",
          locale: "de",
          timezone: "UTC",
          theme: "SYSTEM",
          reducedMotion: false,
          uiPreferences: {},
        },
      }),
    };

    const service = buildServiceWithRepository(repository);

    await new UpdateMeUseCase(service).execute(
      {
        actorId: "22222222-2222-4222-8222-222222222222",
        systemRole: "USER",
      },
      {
        email: "New.Email@Example.Test",
      },
    );

    expect(updateProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({
          email: "new.email@example.test",
        }),
      }),
    );
  });

  it("revokes refresh tokens only after the transaction committed", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";
    const steps: string[] = [];
    const row = {
      id: userId,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: "00000000-0000-4000-8000-000000000001",
      updatedBy: null,
      email: "user@example.test",
      displayName: "User",
      username: "user",
      userTag: "user#000001",
      systemRole: "USER",
      status: "DISABLED",
      emailVerifiedAt: null,
      lastLoginAt: null,
    };
    const repository: Partial<UsersRepository> = {
      findById: jest.fn().mockResolvedValue({ ...row, version: 1, status: "ACTIVE" }),
      update: jest.fn().mockResolvedValue(row),
    };
    const tx: TransactionManager = {
      inTransaction: async (work) => {
        const result = await work({} as AppDatabase);
        steps.push("commit");
        return result;
      },
    };
    const service = new UsersService(
      {} as AppDatabase,
      tx,
      repository as UsersRepository,
      undefined,
      {
        revokeRefreshTokensForUser: async () => {
          steps.push("revoke");
        },
      },
    );

    await new UpdateUserUseCase(service).execute(
      { actorId: "55555555-5555-4555-8555-555555555555", systemRole: "ADMIN" },
      userId,
      { expectedVersion: 1, status: "DISABLED" },
    );

    expect(steps).toEqual(["commit", "revoke"]);
  });
});
