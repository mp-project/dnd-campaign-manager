import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { ConflictError, InternalError } from "#core/error/http/index";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import type {
  RegisterDto,
  VerifyEmailVerificationDto,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  buildRegistrationVerificationUrl,
  renderRegistrationExistingAccountEmail,
  renderRegistrationVerificationEmail,
} from "#src/modules/auth/email/RegistrationVerificationEmailTemplate";
import {
  type AuthAttemptService,
  authEmailAttemptKeys,
  verificationAttemptKeys,
} from "#src/modules/auth/service/AuthAttemptService";
import type {
  AuthServiceDependencies,
  ClientMetadata,
  VerifyRegistrationLinkResult,
} from "#src/modules/auth/service/AuthService.contracts";
import { MAX_VERIFICATION_ATTEMPTS } from "#src/modules/auth/service/AuthService.contracts";
import { normalizeEmail, normalizeRedirectPath } from "#src/modules/auth/service/AuthService.utils";
import { decodeSignedJson, encodeSignedJson, sha256 } from "#src/modules/auth/utils/crypto";
import { generateUniqueUserTag, usernameFromDisplayName } from "#src/modules/auth/service/UserTag";

const VERIFICATION_FAILED = "Verification code is invalid or expired";

const registrationVerificationLinkPayloadSchema = z.strictObject({
  email: z.string().email(),
  verificationId: z.string().uuid(),
  verificationCode: z.string().regex(/^\d{6}$/),
  redirectPath: z.string().min(1).max(500).default("/"),
  expiresAt: z.number().int().positive(),
});

type RegistrationVerificationLinkPayload = z.infer<
  typeof registrationVerificationLinkPayloadSchema
>;

export class AuthRegistrationService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly hashPassword: (password: string) => Promise<string>,
    private readonly attempts: AuthAttemptService,
  ) {}

  /**
   * Sends a new code to an unverified account. Unknown and verified addresses get the same
   * answer and no email, so the response tells nothing about existing accounts.
   */
  async requestRegistrationVerification(email: string, metadata: ClientMetadata): Promise<void> {
    const normalizedEmail = normalizeEmail(email);

    await this.attempts.consume(authEmailAttemptKeys(normalizedEmail, metadata.ip));

    const existingUser = await this.deps.repository.findByEmail(this.deps.db, normalizedEmail);

    if (!existingUser || existingUser.emailVerifiedAt) {
      return;
    }

    await this.issueVerificationCode(normalizedEmail);
  }

  /**
   * Answers the same way whether the address is free or not. A free address gets an account and
   * a code; a taken one gets an email to its owner instead (with a new code while unverified),
   * so only the mailbox learns that the account exists.
   */
  async register(input: RegisterDto, metadata: ClientMetadata): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);

    await this.attempts.consume(authEmailAttemptKeys(normalizedEmail, metadata.ip));

    // Hashed before the lookup so both outcomes take about the same time.
    const passwordHash = await this.hashPassword(input.password);
    const normalizedDisplayName = input.displayName.trim();

    const created = await this.deps.transactionManager.inTransaction(async (tx) => {
      const existingUser = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (existingUser) {
        if (!existingUser.emailVerifiedAt) {
          // Nobody has proven the mailbox yet, so the latest registration sets the password:
          // a stranger who registered the address first cannot keep theirs once its owner
          // registers too.
          await this.deps.repository.updatePasswordHash(tx, {
            userId: existingUser.id,
            passwordHash,
            actorId: existingUser.id,
          });
        }

        return { existingUser };
      }

      const username = input.username ?? usernameFromDisplayName(normalizedDisplayName);
      const userTag = await generateUniqueUserTag(username, async (candidate) =>
        Boolean(await this.deps.repository.findByUserTag(tx, candidate)),
      );

      const user = await this.deps.repository.create(tx, {
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedDisplayName,
        username,
        userTag,
        systemRole: SYSTEM_ROLE.USER,
        status: "ACTIVE",
        emailVerifiedAt: null,
      });

      return { user };
    });

    if ("existingUser" in created) {
      if (created.existingUser.emailVerifiedAt) {
        await this.sendExistingAccountEmail(normalizedEmail);
      } else {
        await this.issueVerificationCode(normalizedEmail);
      }

      return;
    }

    await this.issueVerificationCode(normalizedEmail);
  }

  async verifyRegistrationEmail(input: VerifyEmailVerificationDto, metadata: ClientMetadata) {
    return this.attempts.trackFailures(
      verificationAttemptKeys(normalizeEmail(input.email), metadata.ip),
      (error) => error instanceof ConflictError,
      () => this.verifyCode({ ...input, verificationId: null }),
    );
  }

  /**
   * Every failure gives the same answer, so it does not tell whether the address has an account,
   * is verified already or has a code waiting. `verificationId` comes only from the signed link;
   * a code typed in is matched against the pending request of the address.
   */
  private async verifyCode(input: {
    email: string;
    verificationId: string | null;
    verificationCode: string;
  }) {
    const normalizedEmail = normalizeEmail(input.email);

    // Failures are returned instead of thrown: throwing would roll back the attempt count.
    const outcome = await this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (!user || user.emailVerifiedAt) {
        return { failure: VERIFICATION_FAILED };
      }

      const verificationRequest =
        input.verificationId === null
          ? await this.deps.repository.findPendingEmailVerificationRequestByEmail(
              tx,
              normalizedEmail,
            )
          : await this.deps.repository.findEmailVerificationRequestById(tx, input.verificationId);

      if (
        !verificationRequest ||
        verificationRequest.email !== normalizedEmail ||
        verificationRequest.status !== "PENDING"
      ) {
        return { failure: VERIFICATION_FAILED };
      }

      if (this.isVerificationExpired(verificationRequest.expiresAt)) {
        await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: verificationRequest.id,
          status: "EXPIRED",
        });
        return { failure: VERIFICATION_FAILED };
      }

      const suppliedHash = this.hashVerificationCode(
        normalizedEmail,
        input.verificationCode,
      );

      if (!this.hashMatches(suppliedHash, verificationRequest.codeHash)) {
        await this.deps.repository.updateEmailVerificationAttemptCount(tx, verificationRequest.id);

        if (verificationRequest.attemptCount + 1 >= MAX_VERIFICATION_ATTEMPTS) {
          await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
            verificationId: verificationRequest.id,
            status: "EXPIRED",
          });
        }

        return { failure: VERIFICATION_FAILED };
      }

      const verifiedAt = new Date();

      const updatedUser = await this.deps.repository.updateEmailVerified(tx, {
        userId: user.id,
        verifiedAt,
      });

      if (!updatedUser) {
        return { failure: VERIFICATION_FAILED };
      }

      await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
        verificationId: verificationRequest.id,
        status: "VERIFIED",
        verifiedAt,
      });

      return { user: updatedUser };
    });

    if ("failure" in outcome) {
      throw new ConflictError(outcome.failure);
    }

    return outcome.user;
  }

  async verifyRegistrationEmailByToken(
    token: string,
    metadata: ClientMetadata,
  ): Promise<VerifyRegistrationLinkResult> {
    const payload = this.decodeRegistrationVerificationToken(token);

    if (!payload || payload.expiresAt <= Date.now()) {
      throw new ConflictError(VERIFICATION_FAILED);
    }

    const user = await this.attempts.trackFailures(
      verificationAttemptKeys(payload.email, metadata.ip),
      (error) => error instanceof ConflictError,
      () =>
        this.verifyCode({
          email: payload.email,
          verificationId: payload.verificationId,
          verificationCode: payload.verificationCode,
        }),
    );

    return {
      user,
      redirectPath: normalizeRedirectPath(payload.redirectPath),
    };
  }

  private generateVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private hashVerificationCode(email: string, code: string): string {
    return sha256(`${this.deps.config.emailVerificationSecret}:${email}:${code}`);
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

  private async issueVerificationCode(email: string): Promise<void> {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.deps.config.emailVerificationCodeTtlHours * 60 * 60 * 1000,
    );

    const verificationRequest = await this.deps.transactionManager.inTransaction(async (tx) =>
      this.deps.repository.createEmailVerificationRequest(tx, {
        email,
        codeHash: this.hashVerificationCode(email, code),
        expiresAt,
      }),
    );

    try {
      await this.sendVerificationEmail({
        email,
        verificationId: verificationRequest.id,
        code,
        expiresAt,
      });
    } catch {
      await this.deps.transactionManager.inTransaction(async (tx) => {
        await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: verificationRequest.id,
          status: "EXPIRED",
        });
      });

      throw new InternalError("Failed to deliver verification email");
    }
  }

  private async sendExistingAccountEmail(email: string): Promise<void> {
    if (!this.deps.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    const message = renderRegistrationExistingAccountEmail({
      locale: undefined,
      loginUrl: new URL("/login", this.deps.config.frontendOrigin).toString(),
    });

    try {
      await this.deps.emailPort.send({ to: email, subject: message.subject, text: message.text });
    } catch {
      throw new InternalError("Failed to deliver verification email");
    }
  }

  private async sendVerificationEmail(input: {
    email: string;
    verificationId: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.deps.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    const token = this.createRegistrationVerificationToken({
      email: input.email,
      verificationId: input.verificationId,
      verificationCode: input.code,
      redirectPath: "/",
      expiresAt: input.expiresAt.getTime(),
    });

    const verificationUrl = buildRegistrationVerificationUrl({
      apiBaseUrl: this.deps.config.apiBaseUrl,
      token,
    });

    const message = renderRegistrationVerificationEmail({
      locale: undefined,
      verificationCode: input.code,
      verificationUrl,
      expiresAt: input.expiresAt,
    });

    await this.deps.emailPort.send({
      to: input.email,
      subject: message.subject,
      text: message.text,
    });
  }

  private createRegistrationVerificationToken(
    payload: RegistrationVerificationLinkPayload,
  ): string {
    return encodeSignedJson(payload, this.deps.config.emailVerificationSecret);
  }

  private decodeRegistrationVerificationToken(
    token: string,
  ): RegistrationVerificationLinkPayload | null {
    const rawPayload = decodeSignedJson<unknown>(
      token,
      this.deps.config.emailVerificationSecret,
    );

    if (!rawPayload) {
      return null;
    }

    const parsed = registrationVerificationLinkPayloadSchema.safeParse(rawPayload);
    return parsed.success ? parsed.data : null;
  }
}
