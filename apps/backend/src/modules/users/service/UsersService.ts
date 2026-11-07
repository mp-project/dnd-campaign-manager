import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  VersionConflictError,
} from "#core/error/http/index";
import { authorized } from "#core/history/authorization";
import type { HistoryPort } from "#core/history/types";
import type { CampaignContext, RequestContext, SystemRole } from "#core/http/requestContext";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { isAdminRole, isSysAdminRole, SYSTEM_ROLE } from "#core/permissions/roles";
import type { PermissionService } from "#core/permissions/service";
import type { AuthSessionDependencies } from "#src/modules/auth/index";
import type { UpdateUserDto } from "#src/modules/users/domain/dto/UpdateUserDto";
import type { UserRow } from "#src/modules/users/domain/repository/UsersRepository";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { trackedUser, USER_ACTIONS } from "#src/modules/users/history/TrackedUser";

export class UsersService {
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: UsersRepository,
    private readonly history: HistoryPort,
    private readonly permissionService?: PermissionService,
    private readonly authSessionDependencies?: AuthSessionDependencies,
  ) {}

  async getOneBy(input: { userId: string } | { email: string }): Promise<UserRow | null> {
    if ("userId" in input) {
      return this.repository.findById(this.db, input.userId);
    }

    return this.repository.findByEmail(this.db, normalizeEmail(input.email));
  }

  async getOneByUserTag(userTag: string): Promise<UserRow | null> {
    return this.repository.findByUserTag(this.db, userTag);
  }

  listPublicSummaries(userIds: string[]) {
    return this.repository.listPublicSummaries(this.db, userIds);
  }

  /**
   * Applies a managed change to a user, guarded against role escalation and losing the last admin.
   * A role or status change raises the session version, which ends the access tokens at once.
   * Refresh tokens are revoked after the commit: the auth module uses its own connection, which
   * must not be requested while this transaction holds the user's row lock.
   */
  async applyUserUpdate(
    context: RequestContext,
    userId: string,
    input: UpdateUserDto,
    action: string = USER_ACTIONS.update,
  ): Promise<UserRow> {
    const actorId = this.assertAuthenticated(context);

    const { updated, disabled } = await this.history.runAction(
      {
        action,
        context,
        // The rules depend on the locked row, so they are checked in the action below.
        authorize: async () => authorized(),
      },
      async (scope) => {
        if (!(await this.repository.findById(scope.tx, userId))) {
          throw new NotFoundError("User not found");
        }

        let wasDisabled = false;

        const { row } = await scope.change(trackedUser, userId, async (current) => {
          const nextRole = input.systemRole ?? current.systemRole;
          const nextStatus = input.status ?? current.status;

          this.assertCannotRemoveOwnElevatedRole(actorId, userId, current.systemRole, nextRole);
          this.assertActorCanManageTarget(context.systemRole, current.systemRole, nextRole);

          await this.assertLastActiveAdminNotRemoved(scope.tx, current, nextRole, nextStatus);

          // No comparison per field: the own profile changes without entries, so it would not show.
          if (current.version !== input.expectedVersion) {
            throw new VersionConflictError("User update version mismatch");
          }

          wasDisabled = nextStatus === "DISABLED" && current.status !== "DISABLED";

          // A new role or status ends the user's access tokens; the next refresh carries the new
          // role, and refreshing fails for anyone who is no longer active.
          const accessChanged =
            nextRole !== current.systemRole || nextStatus !== current.status;

          return {
            set: Object.fromEntries(
              Object.entries({
                displayName: input.displayName,
                systemRole: input.systemRole,
                status: input.status,
                sessionVersion: accessChanged ? current.sessionVersion + 1 : undefined,
              }).filter(([, value]) => value !== undefined),
            ),
          };
        });

        return { updated: row, disabled: wasDisabled };
      },
    );

    if (disabled) {
      await this.authSessionDependencies?.revokeRefreshTokensForUser(updated.id);
    }

    return updated;
  }

  /**
   * Only system admins see every user; everyone else sees users with the USER role.
   */
  canReadAllUsers(context: RequestContext): boolean {
    return isSysAdminRole(context.systemRole);
  }

  isVisibleToActor(context: RequestContext, user: UserRow): boolean {
    return this.canReadAllUsers(context) || user.systemRole === SYSTEM_ROLE.USER;
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
      permissions: [],
    };

    return this.permissionService.listEffectivePermissions(globalContext);
  }

  normalizeEmail(email: string): string {
    return normalizeEmail(email);
  }

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
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
      throw new ForbiddenError("Admins can only manage users with USER role");
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

    if (!isSysAdminRole(currentRole)) {
      return;
    }

    if (nextRole !== currentRole) {
      throw new ConflictError("Cannot remove your own elevated role");
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
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
