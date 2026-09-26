import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  VersionConflictError,
} from "#core/error/http/index";
import type { CampaignContext, RequestContext, SystemRole } from "#core/http/requestContext";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import {
  isAdminRole,
  isElevatedSystemRole,
  SYSTEM_ROLE,
  type CampaignRole,
} from "#core/permissions/roles";
import type { PermissionService } from "#core/permissions/service";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import type { UpdateSettingsDto } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import type { AdminUpdateUserDto } from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import type { AuthSessionDependencies } from "#src/modules/auth/index";
import type {
  AdminUserListFilter,
  UserAggregate,
  UserRow,
} from "#src/modules/users/domain/repository/UsersRepository";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";

type CampaignOverviewItem = {
  campaignId: string;
  role: "OWNER" | CampaignRole;
  source: "owned" | "managed" | "joined";
};

type UserInvitation = {
  invitationId: string;
  campaignId: string;
  role: CampaignRole;
  invitedAt: string;
};

export class UsersService {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: UsersRepository,
    private readonly permissionService?: PermissionService,
    private readonly authSessionDependencies?: AuthSessionDependencies,
  ) {}

  async getMe(context: RequestContext): Promise<UserAggregate> {
    const actorId = this.assertAuthenticated(context);
    const aggregate = await this.repository.loadUserAggregate(this.db, actorId, actorId);

    if (!aggregate) {
      throw new NotFoundError("User not found");
    }

    return aggregate;
  }

  async updateMe(context: RequestContext, input: UpdateMeDto): Promise<UserAggregate> {
    const actorId = this.assertAuthenticated(context);

    return this.transactionManager.inTransaction(async (tx) => {
      const current = await this.repository.findById(tx, actorId);

      if (!current) {
        throw new NotFoundError("User not found");
      }

      const patch = {
        ...input,
        email: input.email !== undefined ? normalizeEmail(input.email) : undefined,
      };

      if (patch.email && patch.email !== current.email) {
        const taken = await this.repository.isActiveEmailTaken(tx, patch.email, actorId);

        if (taken) {
          throw new ConflictError("Email is already in use");
        }
      }

      const updated = await this.repository.updateMe(tx, {
        userId: actorId,
        actorId,
        patch,
      });

      if (!updated) {
        throw new NotFoundError("User not found");
      }

      const aggregate = await this.repository.loadUserAggregate(tx, updated.id, actorId);

      if (!aggregate) {
        throw new NotFoundError("User not found");
      }

      return aggregate;
    });
  }

  async updateSettings(
    context: RequestContext,
    input: UpdateSettingsDto,
  ): Promise<UserAggregate> {
    const actorId = this.assertAuthenticated(context);

    return this.transactionManager.inTransaction(async (tx) => {
      const current = await this.repository.findById(tx, actorId);

      if (!current) {
        throw new NotFoundError("User not found");
      }

      await this.repository.updateSettings(tx, {
        userId: actorId,
        actorId,
        patch: input,
      });

      const aggregate = await this.repository.loadUserAggregate(tx, actorId, actorId);

      if (!aggregate) {
        throw new NotFoundError("User not found");
      }

      return aggregate;
    });
  }

  async getCampaignOverview(
    context: RequestContext,
  ): Promise<{ ownedOrManaged: CampaignOverviewItem[]; joined: CampaignOverviewItem[] }> {
    this.assertAuthenticated(context);

    return {
      ownedOrManaged: [],
      joined: [],
    };
  }

  async getInvitations(context: RequestContext): Promise<UserInvitation[]> {
    this.assertAuthenticated(context);

    return [];
  }

  async adminList(
    context: RequestContext,
    filter: AdminUserListFilter,
  ): Promise<{ items: UserRow[]; total: number }> {
    this.assertAdminOrSuperAdmin(context);

    const [items, total] = await Promise.all([
      this.repository.listAdminUsers(this.db, filter),
      this.repository.countAdminUsers(this.db, filter),
    ]);

    return { items, total };
  }

  async adminGetById(context: RequestContext, userId: string): Promise<UserRow> {
    this.assertAdminOrSuperAdmin(context);

    const user = await this.repository.findById(this.db, userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async adminUpdate(
    context: RequestContext,
    userId: string,
    input: AdminUpdateUserDto,
  ): Promise<UserRow> {
    const { actorId, actorRole } = this.assertAdminOrSuperAdmin(context);

    return this.transactionManager.inTransaction(async (tx) => {
      const current = await this.repository.findById(tx, userId);

      if (!current) {
        throw new NotFoundError("User not found");
      }

      const nextRole = input.systemRole ?? current.systemRole;
      const nextStatus = input.status ?? current.status;

      this.assertCannotRemoveOwnElevatedRole(
        actorId,
        userId,
        current.systemRole,
        nextRole,
      );
      this.assertActorCanManageTarget(actorRole, current.systemRole, nextRole);

      await this.assertLastActiveAdminNotRemoved(tx, current, nextRole, nextStatus);

      const updated = await this.repository.updateAdminWithVersion(tx, {
        userId,
        actorId,
        expectedVersion: input.expectedVersion,
        patch: {
          displayName: input.displayName,
          systemRole: input.systemRole,
          status: input.status,
        },
      });

      if (!updated) {
        throw new VersionConflictError("User update version mismatch");
      }

      if (nextStatus === "DISABLED" && current.status !== "DISABLED") {
        await this.revokeRefreshTokensForUser(updated.id);
      }

      return updated;
    });
  }

  listEffectiveGlobalPermissions(context: RequestContext): string[] {
    if (!this.permissionService) {
      return [];
    }

    const globalContext: CampaignContext = {
      actorId: context.actorId,
      systemRole: context.systemRole,
      campaignId: "global",
      rulesetId: "global",
      campaignMemberId: null,
      campaignRole: null,
      permissions: [],
    };

    return this.permissionService.listEffectivePermissions(globalContext);
  }

  private assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }

  private assertAdminOrSuperAdmin(context: RequestContext): {
    actorId: string;
    actorRole: SystemRole;
  } {
    const actorId = this.assertAuthenticated(context);

    if (!isElevatedSystemRole(context.systemRole)) {
      throw new ForbiddenError("Admin permissions required");
    }

    return {
      actorId,
      actorRole: context.systemRole,
    };
  }

  private assertActorCanManageTarget(
    actorRole: SystemRole,
    targetCurrentRole: UserRow["systemRole"],
    targetNextRole: UserRow["systemRole"],
  ): void {
    if (
      targetCurrentRole === SYSTEM_ROLE.SYSTEM ||
      targetNextRole === SYSTEM_ROLE.SYSTEM
    ) {
      throw new ForbiddenError("SYSTEM user cannot be modified via admin API");
    }

    if (!isAdminRole(actorRole)) {
      return;
    }

    if (
      targetCurrentRole !== SYSTEM_ROLE.USER ||
      targetNextRole !== SYSTEM_ROLE.USER
    ) {
      throw new ForbiddenError(
        "Admins can only manage users with USER role",
      );
    }
  }

  private assertCannotRemoveOwnElevatedRole(
    actorId: string,
    targetUserId: string,
    currentRole: UserRow["systemRole"],
    nextRole: UserRow["systemRole"],
  ): void {
    if (actorId !== targetUserId) {
      return;
    }

    if (!isElevatedSystemRole(currentRole)) {
      return;
    }

    if (nextRole !== currentRole) {
      throw new ConflictError(
        "Cannot remove your own elevated role",
      );
    }
  }

  private async assertLastActiveAdminNotRemoved(
    db: AppDatabase,
    current: UserRow,
    nextRole: UserRow["systemRole"],
    nextStatus: UserRow["status"],
  ): Promise<void> {
    const currentlyActiveAdmin =
      current.systemRole === SYSTEM_ROLE.ADMIN && current.status === "ACTIVE";
    const staysActiveAdmin =
      nextRole === SYSTEM_ROLE.ADMIN && nextStatus === "ACTIVE";

    if (!currentlyActiveAdmin || staysActiveAdmin) {
      return;
    }

    const activeAdminCount = await this.repository.countActiveAdmins(db);

    if (activeAdminCount <= 1) {
      throw new ConflictError("Cannot demote or disable the last active admin");
    }
  }

  private async revokeRefreshTokensForUser(userId: string): Promise<void> {
    if (!this.authSessionDependencies) {
      return;
    }

    await this.authSessionDependencies.revokeRefreshTokensForUser(userId);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
