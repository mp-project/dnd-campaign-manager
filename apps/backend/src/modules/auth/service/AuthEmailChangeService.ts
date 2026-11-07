import { randomInt } from "node:crypto";
import { z } from "zod";

import { ConflictError, InternalError, NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { UserRow } from "#src/modules/auth/domain/repository/AuthRepository";
import {
  buildEmailChangeConfirmationUrl,
  renderEmailChangeConfirmationEmail,
  renderEmailChangeNoticeEmail,
} from "#src/modules/auth/email/EmailChangeEmailTemplate";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import {
  type AuthAttemptService,
  authEmailAttemptKeys,
  loginAttemptKeys,
  verificationAttemptKeys,
} from "#src/modules/auth/service/AuthAttemptService";
import type {
  AuthServiceDependencies,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";
import { MAX_VERIFICATION_ATTEMPTS } from "#src/modules/auth/service/AuthService.contracts";
import { normalizeEmail } from "#src/modules/auth/service/AuthService.utils";
import {
  constantTimeEqual,
  decodeSignedJson,
  encodeSignedJson,
  sha256,
} from "#src/modules/auth/utils/crypto";

const emailChangeLinkPayloadSchema = z.strictObject({
  purpose: z.literal("email-change"),
  userId: z.string().uuid(),
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.number().int().positive(),
});

type EmailChangeLinkPayload = z.infer<typeof emailChangeLinkPayloadSchema>;

/**
 * Changes the address of an account in two steps. The request needs the current password (if the
 * account has one) and only stores the new address as pending; the address changes once the code
 * sent to it comes back. The old address gets a notice, so the owner sees changes they did not ask
 * for. A confirmed address counts as verified.
 */
export class AuthEmailChangeService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly assertAuthenticated: (context: RequestContext) => string,
    private readonly verifyPassword: (passwordHash: string | null, password: string) => Promise<boolean>,
    private readonly attempts: AuthAttemptService,
  ) {}

  async requestEmailChange(
    context: RequestContext,
    input: { email: string; currentPassword?: string | undefined },
    metadata: ClientMetadata,
  ): Promise<{ pendingEmail: string; expiresAt: Date }> {
    const actorId = this.assertAuthenticated(context);
    const newEmail = normalizeEmail(input.email);
    const user = await this.requireActiveUser(actorId);

    await this.attempts.trackFailures(
      loginAttemptKeys(user.email, metadata.ip).all,
      (error) => error instanceof AuthError && error.code === "INVALID_CREDENTIALS",
      () => this.assertCurrentPassword(user, input.currentPassword),
    );

    if (newEmail === user.email) {
      throw new ConflictError("Email is unchanged");
    }

    // Counted per recipient: the confirmation goes to an address the requester may not own.
    await this.attempts.consume(authEmailAttemptKeys(newEmail, metadata.ip));

    if (await this.deps.repository.findByEmail(this.deps.db, newEmail)) {
      throw new ConflictError("Email is already in use");
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(
      Date.now() + this.deps.config.emailVerificationCodeTtlHours * 60 * 60 * 1000,
    );

    await this.deps.transactionManager.inTransaction(async (tx) => {
      await this.deps.repository.updatePendingEmail(tx, {
        userId: user.id,
        pending: { email: newEmail, codeHash: this.hashCode(user.id, newEmail, code), expiresAt },
        actorId: user.id,
      });
    });

    try {
      await this.sendEmails({ user, newEmail, code, expiresAt });
    } catch {
      await this.deps.transactionManager.inTransaction(async (tx) => {
        await this.deps.repository.updatePendingEmail(tx, {
          userId: user.id,
          pending: null,
          actorId: user.id,
        });
      });

      throw new InternalError("Failed to deliver email change confirmation");
    }

    return { pendingEmail: newEmail, expiresAt };
  }

  async confirmEmailChange(
    context: RequestContext,
    input: { verificationCode: string },
    metadata: ClientMetadata,
  ): Promise<UserRow> {
    const actorId = this.assertAuthenticated(context);

    return this.attempts.trackFailures(
      verificationAttemptKeys(`email-change:${actorId}`, metadata.ip),
      (error) => error instanceof ConflictError,
      () => this.confirmCode(actorId, input.verificationCode, null),
    );
  }

  /**
   * The link proves the mailbox like the code does, so it works without a session.
   */
  async confirmEmailChangeByToken(token: string, metadata: ClientMetadata): Promise<UserRow> {
    const payload = this.decodeToken(token);

    if (!payload || payload.expiresAt <= Date.now()) {
      throw new ConflictError("Email change link is invalid or expired");
    }

    return this.attempts.trackFailures(
      verificationAttemptKeys(`email-change:${payload.userId}`, metadata.ip),
      (error) => error instanceof ConflictError,
      () => this.confirmCode(payload.userId, payload.code, payload.email),
    );
  }

  private async requireActiveUser(userId: string): Promise<UserRow> {
    const user = await this.deps.repository.findById(this.deps.db, userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status !== "ACTIVE") {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
    }

    return user;
  }

  private async assertCurrentPassword(
    user: UserRow,
    currentPassword: string | undefined,
  ): Promise<void> {
    // Accounts that only sign in through OAuth have no password; the code sent to the new
    // address and the notice to the old one remain.
    if (!user.passwordHash) {
      return;
    }

    if (!currentPassword || !(await this.verifyPassword(user.passwordHash, currentPassword))) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
    }
  }

  private async confirmCode(
    userId: string,
    code: string,
    expectedEmail: string | null,
  ): Promise<UserRow> {
    // Failures are returned instead of thrown: throwing would roll back the attempt count.
    const outcome = await this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findById(tx, userId);

      if (!user || !user.pendingEmail || !user.pendingEmailCodeHash || !user.pendingEmailExpiresAt) {
        return { failure: "No email change is pending" };
      }

      if (expectedEmail !== null && expectedEmail !== user.pendingEmail) {
        return { failure: "Email change link is outdated" };
      }

      if (user.pendingEmailExpiresAt.getTime() <= Date.now()) {
        await this.deps.repository.updatePendingEmail(tx, { userId, pending: null, actorId: userId });
        return { failure: "Email change code expired" };
      }

      const suppliedHash = this.hashCode(userId, user.pendingEmail, code);

      if (!constantTimeEqual(suppliedHash, user.pendingEmailCodeHash)) {
        if (user.pendingEmailAttemptCount + 1 >= MAX_VERIFICATION_ATTEMPTS) {
          await this.deps.repository.updatePendingEmail(tx, {
            userId,
            pending: null,
            actorId: userId,
          });
          return { failure: "Email change code expired" };
        }

        await this.deps.repository.updatePendingEmailAttemptCount(tx, userId);
        return { failure: "Invalid email change code" };
      }

      const owner = await this.deps.repository.findByEmail(tx, user.pendingEmail);

      if (owner && owner.id !== userId) {
        await this.deps.repository.updatePendingEmail(tx, { userId, pending: null, actorId: userId });
        return { failure: "Email is already in use" };
      }

      const updated = await this.deps.repository.updateEmailFromPending(tx, {
        userId,
        verifiedAt: new Date(),
        actorId: userId,
      });

      return updated ? { user: updated } : { failure: "No email change is pending" };
    });

    if ("failure" in outcome) {
      throw new ConflictError(outcome.failure);
    }

    return outcome.user;
  }

  private async sendEmails(input: {
    user: UserRow;
    newEmail: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.deps.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    const token = encodeSignedJson<EmailChangeLinkPayload>(
      {
        purpose: "email-change",
        userId: input.user.id,
        email: input.newEmail,
        code: input.code,
        expiresAt: input.expiresAt.getTime(),
      },
      this.deps.config.emailVerificationSecret,
    );

    const confirmation = renderEmailChangeConfirmationEmail({
      locale: undefined,
      confirmationCode: input.code,
      confirmationUrl: buildEmailChangeConfirmationUrl({
        apiBaseUrl: this.deps.config.apiBaseUrl,
        token,
      }),
      expiresAt: input.expiresAt,
    });
    const notice = renderEmailChangeNoticeEmail({ locale: undefined, newEmail: input.newEmail });

    await this.deps.emailPort.send({
      to: input.newEmail,
      subject: confirmation.subject,
      text: confirmation.text,
    });
    await this.deps.emailPort.send({
      to: input.user.email,
      subject: notice.subject,
      text: notice.text,
    });
  }

  private hashCode(userId: string, email: string, code: string): string {
    return sha256(`${this.deps.config.emailVerificationSecret}:email-change:${userId}:${email}:${code}`);
  }

  private decodeToken(token: string): EmailChangeLinkPayload | null {
    const raw = decodeSignedJson<unknown>(token, this.deps.config.emailVerificationSecret);

    if (!raw) {
      return null;
    }

    const parsed = emailChangeLinkPayloadSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
