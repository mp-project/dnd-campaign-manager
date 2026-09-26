import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import {
  ConflictError,
  ForbiddenError,
  InternalError,
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
import type { EmailPort } from "#core/email/index";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import type { UpdateSettingsDto } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import type { AdminUpdateUserDto } from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import type { RegisterUserDto } from "#src/modules/users/domain/dto/RegisterUserDto";
import type { VerifyEmailVerificationDto } from "#src/modules/users/domain/dto/VerifyEmailVerificationDto";
import type {
  AdminUserListFilter,
  EmailVerificationRequestRow,
  UserAggregate,
  UserRow,
} from "#src/modules/users/domain/repository/UsersRepository";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";

const scrypt = promisify(scryptCallback);
const MAX_VERIFICATION_ATTEMPTS = 5;

type AuthSessionDependencies = {
  revokeRefreshTokensForUser(userId: string): Promise<void>;
};

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

export type RegisterUserResult = {
  user: UserRow;
  verificationRequest: EmailVerificationRequestRow;
  verificationCode: string;
};

export class UsersService {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: UsersRepository,
    private readonly permissionService?: PermissionService,
    private readonly authSessionDependencies?: AuthSessionDependencies,
    private readonly emailPort?: EmailPort,
    private readonly verificationSecret: string = "verification-secret",
    private readonly verificationCodeTtlHours: number = 24,
  ) {}

  async requestRegistrationVerification(email: string): Promise<EmailVerificationRequestRow> {
    const normalizedEmail = normalizeEmail(email);
    const code = this.generateVerificationCode();
    const codeHash = this.hashVerificationCode(normalizedEmail, code);
    const expiresAt = new Date(
      Date.now() + this.verificationCodeTtlHours * 60 * 60 * 1000,
    );

    const existingUser = await this.repository.findByEmail(this.db, normalizedEmail);

    if (!existingUser) {
      throw new NotFoundError("User not found");
    }

    if (existingUser.emailVerifiedAt) {
      throw new ConflictError("Email is already verified");
    }

    const verificationRequest = await this.transactionManager.inTransaction(
      async (tx) => {
        return this.repository.createEmailVerificationRequest(tx, {
          email: normalizedEmail,
          codeHash,
          expiresAt,
        });
      },
    );

    try {
      await this.sendVerificationEmail(normalizedEmail, code, expiresAt);
    } catch {
      await this.transactionManager.inTransaction(async (tx) => {
        await this.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: verificationRequest.id,
          status: "EXPIRED",
        });
      });

      throw new InternalError("Failed to deliver verification email");
    }

    return verificationRequest;
  }

  async getRegistrationVerificationStatus(
    verificationId: string,
  ): Promise<EmailVerificationRequestRow> {
    return this.transactionManager.inTransaction(async (tx) => {
      const request = await this.repository.findEmailVerificationRequestById(
        tx,
        verificationId,
      );

      if (!request) {
        throw new NotFoundError("Verification request not found");
      }

      if (request.status === "PENDING" && this.isVerificationExpired(request.expiresAt)) {
        const updated = await this.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: request.id,
          status: "EXPIRED",
        });

        if (updated) {
          return updated;
        }
      }

      return request;
    });
  }

  async register(input: RegisterUserDto): Promise<RegisterUserResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();
    const code = this.generateVerificationCode();
    const codeHash = this.hashVerificationCode(normalizedEmail, code);
    const expiresAt = new Date(
      Date.now() + this.verificationCodeTtlHours * 60 * 60 * 1000,
    );

    const created = await this.transactionManager.inTransaction(async (tx) => {
      const existingUser = await this.repository.findByEmail(tx, normalizedEmail);

      if (existingUser) {
        throw new ConflictError("Email is already in use");
      }

      const passwordHash = await hashPassword(input.password);
      const user = await this.repository.createUser(tx, {
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedDisplayName,
        systemRole: SYSTEM_ROLE.USER,
        status: "ACTIVE",
        emailVerifiedAt: null,
      });

      const verificationRequest = await this.repository.createEmailVerificationRequest(tx, {
        email: normalizedEmail,
        codeHash,
        expiresAt,
      });

      return {
        user,
        verificationRequest,
        verificationCode: code,
      };
    });

    try {
      await this.sendVerificationEmail(normalizedEmail, code, expiresAt);
    } catch {
      await this.transactionManager.inTransaction(async (tx) => {
        await this.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: created.verificationRequest.id,
          status: "EXPIRED",
        });
      });

      throw new InternalError("Failed to deliver verification email");
    }

    return created;
  }

  async verifyRegistrationEmail(input: VerifyEmailVerificationDto): Promise<UserRow> {
    const normalizedEmail = normalizeEmail(input.email);

    return this.transactionManager.inTransaction(async (tx) => {
      const user = await this.repository.findByEmail(tx, normalizedEmail);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      if (user.emailVerifiedAt) {
        throw new ConflictError("Email is already verified");
      }

      const verificationRequest = await this.repository.findEmailVerificationRequestById(
        tx,
        input.verificationId,
      );

      if (!verificationRequest) {
        throw new ConflictError("Invalid verification request");
      }

      if (verificationRequest.email !== normalizedEmail) {
        throw new ConflictError("Verification request does not match email");
      }

      if (verificationRequest.status !== "PENDING") {
        throw new ConflictError("Verification request is no longer pending");
      }

      if (this.isVerificationExpired(verificationRequest.expiresAt)) {
        await this.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: verificationRequest.id,
          status: "EXPIRED",
        });
        throw new ConflictError("Verification code expired");
      }

      const suppliedHash = this.hashVerificationCode(
        normalizedEmail,
        input.verificationCode,
      );

      if (!this.hashMatches(suppliedHash, verificationRequest.codeHash)) {
        await this.repository.incrementEmailVerificationAttemptCount(
          tx,
          verificationRequest.id,
        );

        if (verificationRequest.attemptCount + 1 >= MAX_VERIFICATION_ATTEMPTS) {
          await this.repository.updateEmailVerificationRequestStatus(tx, {
            verificationId: verificationRequest.id,
            status: "EXPIRED",
          });
          throw new ConflictError("Verification code expired");
        }

        throw new ConflictError("Invalid verification code");
      }

      const verifiedAt = new Date();

      const updatedUser = await this.repository.markEmailVerified(tx, {
        userId: user.id,
        verifiedAt,
      });

      if (!updatedUser) {
        throw new NotFoundError("User not found");
      }

      await this.repository.updateEmailVerificationRequestStatus(tx, {
        verificationId: verificationRequest.id,
        status: "VERIFIED",
        verifiedAt,
      });

      return updatedUser;
    });
  }

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

  private generateVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private hashVerificationCode(email: string, code: string): string {
    return createHash("sha256")
      .update(`${this.verificationSecret}:${email}:${code}`)
      .digest("hex");
  }

  private hashMatches(supplied: string, stored: string): boolean {
    const suppliedBuffer = Buffer.from(supplied, "utf8");
    const storedBuffer = Buffer.from(stored, "utf8");

    if (suppliedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(suppliedBuffer, storedBuffer);
  }

  private isVerificationExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= Date.now();
  }

  private async sendVerificationEmail(
    email: string,
    code: string,
    expiresAt: Date,
  ): Promise<void> {
    if (!this.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    await this.emailPort.send({
      to: email,
      subject: "Dein Verifizierungscode",
      text:
        `Dein Verifizierungscode lautet: ${code}\n` +
        `Der Code ist bis ${expiresAt.toISOString()} gueltig.`,
    });
  }

}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}
