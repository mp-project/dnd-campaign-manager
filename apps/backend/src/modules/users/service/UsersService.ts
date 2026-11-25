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
import type { IdentityPort } from "#core/auth/identity";
import { reportErrorInContext } from "#core/log/reportError";
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
    private readonly identityPort?: IdentityPort,
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
   * Role and status apply to the account's next request: the commit publishes
   * `history.user.changed`, which drops the cached account (`AccountCache`).
   * The identity provider is told after the commit (locking ends the account's sessions there
   * too): it is a network call, which must not run while this transaction holds the row lock.
   */
  async applyUserUpdate(
    context: RequestContext,
    userId: string,
    input: UpdateUserDto,
    action: string = USER_ACTIONS.update,
  ): Promise<UserRow> {
    const actorId = this.assertAuthenticated(context);

    const { updated } = await this.history.runAction(
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

          return {
            set: Object.fromEntries(
              Object.entries({
                displayName: input.displayName,
                systemRole: input.systemRole,
                status: input.status,
              }).filter(([, value]) => value !== undefined),
            ),
          };
        });

        return { updated: row };
      },
    );

    await this.syncProviderLock(updated, input.status);

    return updated;
  }

  /**
   * Keeps the identity provider in step with the status: not ACTIVE bans the account there (ends
   * its sessions), ACTIVE lifts the ban. Runs for every change that names a status, not only on a
   * transition, so saving the status again repairs a ban that failed before. The change is already
   * committed and the database refuses a locked account on every request anyway, so a failure here
   * is reported, not thrown.
   */
  private async syncProviderLock(user: UserRow, requestedStatus: UserRow["status"] | undefined): Promise<void> {
    if (!this.identityPort || !user.clerkUserId || requestedStatus === undefined) {
      return;
    }

    try {
      if (user.status === "ACTIVE") {
        await this.identityPort.unlockUser(user.clerkUserId);
      } else {
        await this.identityPort.lockUser(user.clerkUserId);
      }
    } catch (error) {
      reportErrorInContext(error, "Identity provider lock not in step with the account status", {
        userId: user.id,
        status: user.status,
      });
    }
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
