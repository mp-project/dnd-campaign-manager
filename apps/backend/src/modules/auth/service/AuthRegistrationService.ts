import { randomInt, timingSafeEqual } from "node:crypto";

import { ConflictError, InternalError, NotFoundError } from "#core/error/http/index";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import type {
  RegisterDto,
  VerifyEmailVerificationDto,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import type {
  AuthServiceDependencies,
  RegisterUserResult,
} from "#src/modules/auth/service/AuthService.contracts";
import { MAX_VERIFICATION_ATTEMPTS } from "#src/modules/auth/service/AuthService.contracts";
import { normalizeEmail } from "#src/modules/auth/service/AuthService.utils";
import { sha256 } from "#src/modules/auth/utils/crypto";

export class AuthRegistrationService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly hashPassword: (password: string) => Promise<string>,
  ) {}

  async requestRegistrationVerification(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const code = this.generateVerificationCode();
    const codeHash = this.hashVerificationCode(normalizedEmail, code);
    const expiresAt = new Date(
      Date.now() + this.deps.config.emailVerificationCodeTtlHours * 60 * 60 * 1000,
    );

    const existingUser = await this.deps.repository.findByEmail(this.deps.db, normalizedEmail);

    if (!existingUser) {
      throw new NotFoundError("User not found");
    }

    if (existingUser.emailVerifiedAt) {
      throw new ConflictError("Email is already verified");
    }

    const verificationRequest = await this.deps.transactionManager.inTransaction(async (tx) => {
      return this.deps.repository.createEmailVerificationRequest(tx, {
        email: normalizedEmail,
        codeHash,
        expiresAt,
      });
    });

    try {
      await this.sendVerificationEmail(normalizedEmail, code, expiresAt);
    } catch {
      await this.deps.transactionManager.inTransaction(async (tx) => {
        await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: verificationRequest.id,
          status: "EXPIRED",
        });
      });

      throw new InternalError("Failed to deliver verification email");
    }

    return verificationRequest;
  }

  async getRegistrationVerificationStatus(verificationId: string) {
    return this.deps.transactionManager.inTransaction(async (tx) => {
      const request = await this.deps.repository.findEmailVerificationRequestById(
        tx,
        verificationId,
      );

      if (!request) {
        throw new NotFoundError("Verification request not found");
      }

      if (request.status === "PENDING" && this.isVerificationExpired(request.expiresAt)) {
        const updated = await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
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

  async register(input: RegisterDto): Promise<RegisterUserResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();
    const code = this.generateVerificationCode();
    const codeHash = this.hashVerificationCode(normalizedEmail, code);
    const expiresAt = new Date(
      Date.now() + this.deps.config.emailVerificationCodeTtlHours * 60 * 60 * 1000,
    );

    const created = await this.deps.transactionManager.inTransaction(async (tx) => {
      const existingUser = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (existingUser) {
        throw new ConflictError("Email is already in use");
      }

      const passwordHash = await this.hashPassword(input.password);
      const user = await this.deps.repository.createUser(tx, {
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedDisplayName,
        systemRole: SYSTEM_ROLE.USER,
        status: "ACTIVE",
        emailVerifiedAt: null,
      });

      const verificationRequest = await this.deps.repository.createEmailVerificationRequest(tx, {
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
      await this.deps.transactionManager.inTransaction(async (tx) => {
        await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
          verificationId: created.verificationRequest.id,
          status: "EXPIRED",
        });
      });

      throw new InternalError("Failed to deliver verification email");
    }

    return created;
  }

  async verifyRegistrationEmail(input: VerifyEmailVerificationDto) {
    const normalizedEmail = normalizeEmail(input.email);

    return this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      if (user.emailVerifiedAt) {
        throw new ConflictError("Email is already verified");
      }

      const verificationRequest = await this.deps.repository.findEmailVerificationRequestById(
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
        await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
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
        await this.deps.repository.incrementEmailVerificationAttemptCount(tx, verificationRequest.id);

        if (verificationRequest.attemptCount + 1 >= MAX_VERIFICATION_ATTEMPTS) {
          await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
            verificationId: verificationRequest.id,
            status: "EXPIRED",
          });
          throw new ConflictError("Verification code expired");
        }

        throw new ConflictError("Invalid verification code");
      }

      const verifiedAt = new Date();

      const updatedUser = await this.deps.repository.markEmailVerified(tx, {
        userId: user.id,
        verifiedAt,
      });

      if (!updatedUser) {
        throw new NotFoundError("User not found");
      }

      await this.deps.repository.updateEmailVerificationRequestStatus(tx, {
        verificationId: verificationRequest.id,
        status: "VERIFIED",
        verifiedAt,
      });

      return updatedUser;
    });
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

  private async sendVerificationEmail(
    email: string,
    code: string,
    expiresAt: Date,
  ): Promise<void> {
    if (!this.deps.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    await this.deps.emailPort.send({
      to: email,
      subject: "Dein Verifizierungscode",
      text:
        `Dein Verifizierungscode lautet: ${code}\n` +
        `Der Code ist bis ${expiresAt.toISOString()} gueltig.`,
    });
  }
}
