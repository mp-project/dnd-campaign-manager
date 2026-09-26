import { ConflictError, ForbiddenError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { UsersService } from "#src/modules/users/service/UsersService";

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

describe("UsersService", () => {
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
      updateAdminWithVersion: jest.fn(),
    };

    const service = buildServiceWithRepository(repository);

    await expect(
      service.adminUpdate(
        { actorId: "super-admin-actor", systemRole: "SUPER_ADMIN" },
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
      service.adminUpdate(
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
        systemRole: "SUPER_ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: null,
        lastLoginAt: null,
      }),
    };

    const service = buildServiceWithRepository(repository);

    await expect(
      service.adminUpdate(
        {
          actorId: "11111111-1111-4111-8111-111111111111",
          systemRole: "SUPER_ADMIN",
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
    const updateMe = jest.fn().mockResolvedValue({
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
      updateMe,
      loadUserAggregate: jest.fn().mockResolvedValue({
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

    await service.updateMe(
      {
        actorId: "22222222-2222-4222-8222-222222222222",
        systemRole: "USER",
      },
      {
        email: "New.Email@Example.Test",
      },
    );

    expect(updateMe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({
          email: "new.email@example.test",
        }),
      }),
    );
  });

});
