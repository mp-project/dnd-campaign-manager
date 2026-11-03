import { randomBytes } from "node:crypto";

import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  type AuthAttemptService,
  authEmailAttemptKeys,
  loginAttemptKeys,
} from "#src/modules/auth/service/AuthAttemptService";
import type {
  AuthTrustedDeviceService,
  TrustedDeviceToken,
} from "#src/modules/auth/service/AuthTrustedDeviceService";
import type {
  AuthServiceDependencies,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";
import { PASSWORD_RESET_TTL_MS } from "#src/modules/auth/service/AuthService.contracts";
import { normalizeEmail } from "#src/modules/auth/service/AuthService.utils";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import {
  getPasswordResetErrorMessage,
} from "#src/modules/auth/lang/AuthLang";
import {
  buildPasswordResetUrl,
  renderPasswordResetEmail,
} from "#src/modules/auth/email/PasswordResetEmailTemplate";
import { sha256 } from "#src/modules/auth/utils/crypto";

export class AuthPasswordService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly assertAuthenticated: (context: RequestContext) => string,
    private readonly assertUserCanAuthenticate: (status: "ACTIVE" | "LOCKED" | "DISABLED") => void,
    private readonly hashPassword: (password: string) => Promise<string>,
    private readonly verifyPassword: (passwordHash: string | null, password: string) => Promise<boolean>,
    private readonly consumeComparableDelay: (secret: string) => Promise<void>,
    private readonly attempts: AuthAttemptService,
    private readonly devices: AuthTrustedDeviceService,
  ) {}

  async changePassword(context: RequestContext, input: ChangePasswordDto): Promise<void> {
    const actorId = this.assertAuthenticated(context);

    await this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findById(tx, actorId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      this.assertUserCanAuthenticate(user.status);

      const currentValid = await this.verifyPassword(user.passwordHash, input.currentPassword);

      if (!currentValid) {
        throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
      }

      const newPasswordHash = await this.hashPassword(input.newPassword);

      await this.deps.repository.updatePasswordHash(tx, {
        userId: user.id,
        passwordHash: newPasswordHash,
        actorId: user.id,
      });

      await this.deps.repository.updateRefreshTokensRevokedForUser(tx, {
        userId: user.id,
        actorId: user.id,
      });
      await this.deps.repository.deleteTrustedDevicesForUser(tx, user.id);
    });
  }

  async requestPasswordReset(input: ForgotPasswordDto, metadata: ClientMetadata): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);

    // Counted for unknown emails as well, so a block reveals nothing about existing accounts.
    await this.attempts.consume(authEmailAttemptKeys(normalizedEmail, metadata.ip));

    await this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (!user || !user.passwordHash || user.status !== "ACTIVE") {
        await this.consumeComparableDelay(input.email);
        return;
      }

      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      await this.deps.repository.createPasswordResetToken(tx, {
        userId: user.id,
        tokenHash,
        expiresAt,
        actorId: user.id,
      });

      if (this.deps.emailPort) {
        const resetUrl = buildPasswordResetUrl(this.deps.config.frontendOrigin, rawToken);
        const emailMessage = renderPasswordResetEmail({
          locale: input.locale,
          resetUrl,
          expiresAt,
        });

        await this.deps.emailPort.send({
          to: user.email,
          subject: emailMessage.subject,
          text: emailMessage.text,
        });
      }
    }).catch(async () => {
      await this.consumeComparableDelay(input.email);
    });
  }

  /**
   * The reset link proves ownership of the account. If the account was blocked, the block is lifted
   * and the current browser gets linked without the checkbox, so further attacks cannot lock it out.
   */
  async confirmPasswordReset(
    input: ResetPasswordDto,
    metadata: ClientMetadata,
  ): Promise<TrustedDeviceToken | null> {
    const tokenHash = sha256(input.token);

    const user = await this.deps.transactionManager.inTransaction(async (tx) => {
      const resetToken = await this.deps.repository.findPasswordResetTokenByHash(tx, tokenHash);

      if (!resetToken) {
        throw new AuthError(
          "PASSWORD_RESET_INVALID",
          getPasswordResetErrorMessage("PASSWORD_RESET_INVALID"),
        );
      }

      if (resetToken.consumedAt) {
        throw new AuthError(
          "PASSWORD_RESET_USED",
          getPasswordResetErrorMessage("PASSWORD_RESET_USED"),
        );
      }

      if (resetToken.expiresAt.getTime() <= Date.now()) {
        throw new AuthError(
          "PASSWORD_RESET_EXPIRED",
          getPasswordResetErrorMessage("PASSWORD_RESET_EXPIRED"),
        );
      }

      const user = await this.deps.repository.findById(tx, resetToken.userId);

      if (!user || user.status !== "ACTIVE") {
        throw new AuthError(
          "PASSWORD_RESET_INVALID",
          getPasswordResetErrorMessage("PASSWORD_RESET_INVALID"),
        );
      }

      const newPasswordHash = await this.hashPassword(input.newPassword);

      await this.deps.repository.updatePasswordHash(tx, {
        userId: user.id,
        passwordHash: newPasswordHash,
        actorId: user.id,
      });

      await this.deps.repository.updatePasswordResetTokenConsumed(tx, {
        tokenId: resetToken.id,
        actorId: user.id,
      });

      await this.deps.repository.updateRefreshTokensRevokedForUser(tx, {
        userId: user.id,
        actorId: user.id,
      });
      await this.deps.repository.deleteTrustedDevicesForUser(tx, user.id);

      return user;
    });

    const keys = loginAttemptKeys(user.email, metadata.ip);
    const wasBlocked = await this.attempts.isBlocked(keys.all);

    await this.attempts.clear(keys.emailIp);
    await this.attempts.clear(keys.email);

    return input.trustDevice || wasBlocked ? this.devices.trust(user.id, metadata) : null;
  }
}
