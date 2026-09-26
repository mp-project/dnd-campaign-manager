import { randomBytes, randomUUID } from "node:crypto";

import jsonwebtoken, { type SignOptions } from "jsonwebtoken";

import type { AppDatabase } from "#core/db/pool";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import type { LoginDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { UserRow } from "#src/modules/auth/domain/repository/AuthRepository";
import type {
  AuthServiceDependencies,
  AuthSession,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";
import { sha256 } from "#src/modules/auth/utils/crypto";

export class AuthSessionService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly verifyPassword: (passwordHash: string | null, password: string) => Promise<boolean>,
  ) {}

  async login(input: LoginDto, metadata: ClientMetadata): Promise<AuthSession> {
    const normalizedEmail = input.email.trim().toLowerCase();

    return this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findByEmail(tx, normalizedEmail);
      const passwordValid = await this.verifyPassword(
        user?.passwordHash ?? null,
        input.password,
      );

      if (!user || !passwordValid) {
        throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
      }

      this.assertUserCanAuthenticate(user);

      if (!user.emailVerifiedAt) {
        throw new AuthError("EMAIL_NOT_VERIFIED", "Email verification required");
      }

      await this.deps.repository.updateLastLogin(tx, {
        userId: user.id,
        at: new Date(),
        actorId: user.id,
      });

      const issuedSession = await this.issueSession(tx, user, metadata);

      return issuedSession.session;
    });
  }

  async refresh(refreshToken: string, metadata: ClientMetadata): Promise<AuthSession> {
    const tokenHash = sha256(refreshToken);

    return this.deps.transactionManager.inTransaction(async (tx) => {
      const currentToken = await this.deps.repository.findRefreshTokenByHash(tx, tokenHash);

      if (!currentToken) {
        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      if (currentToken.revokedAt || currentToken.rotatedAt) {
        // Replay detection: if an old/rotated token is reused, invalidate the whole session family.
        await this.deps.repository.revokeRefreshTokenFamily(tx, {
          familyId: currentToken.familyId,
          actorId: currentToken.userId,
        });

        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      if (currentToken.expiresAt.getTime() <= Date.now()) {
        await this.deps.repository.revokeRefreshTokenById(tx, {
          tokenId: currentToken.id,
          actorId: currentToken.userId,
        });

        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      const user = await this.deps.repository.findById(tx, currentToken.userId);

      if (!user) {
        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      this.assertUserCanAuthenticate(user);

      const nextSession = await this.issueSession(tx, user, metadata, currentToken.familyId);

      await this.deps.repository.markRefreshTokenRotated(tx, {
        tokenId: currentToken.id,
        replacedById: nextSession.refreshTokenId,
        actorId: user.id,
      });

      return nextSession.session;
    });
  }

  async logoutCurrent(refreshToken: string | null): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const tokenHash = sha256(refreshToken);

    await this.deps.transactionManager.inTransaction(async (tx) => {
      const currentToken = await this.deps.repository.findRefreshTokenByHash(tx, tokenHash);

      if (!currentToken) {
        return;
      }

      await this.deps.repository.revokeRefreshTokenById(tx, {
        tokenId: currentToken.id,
        actorId: currentToken.userId,
      });
    });
  }

  async logoutAll(actorId: string): Promise<void> {
    await this.deps.transactionManager.inTransaction(async (tx) => {
      await this.deps.repository.revokeAllRefreshTokensForUser(tx, {
        userId: actorId,
        actorId,
      });
    });
  }

  async revokeRefreshTokensForUser(userId: string): Promise<void> {
    await this.deps.transactionManager.inTransaction(async (tx) => {
      await this.deps.repository.revokeAllRefreshTokensForUser(tx, {
        userId,
        actorId: userId,
      });
    });
  }

  assertUserCanAuthenticate(user: UserRow): void {
    if (user.status !== "ACTIVE") {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
    }
  }

  async issueSession(
    db: AppDatabase,
    user: UserRow,
    metadata: ClientMetadata,
    // familyId groups rotated refresh tokens that belong to the same login session.
    familyId: string = randomUUID(),
  ): Promise<{ session: AuthSession; refreshTokenId: string }> {
    const issuedAt = Date.now();
    const accessExpiresAt = new Date(issuedAt + this.deps.accessTtlMs);
    const refreshExpiresAt = new Date(issuedAt + this.deps.refreshTtlMs);
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = sha256(refreshToken);
    const userAgent = metadata.userAgent?.slice(0, 500);
    const ipHash = metadata.ip ? sha256(metadata.ip) : undefined;

    const refreshTokenInput: {
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
      actorId: string;
      userAgent?: string;
      ipHash?: string;
    } = {
      userId: user.id,
      familyId,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
      actorId: user.id,
    };

    if (userAgent !== undefined) {
      refreshTokenInput.userAgent = userAgent;
    }

    if (ipHash !== undefined) {
      refreshTokenInput.ipHash = ipHash;
    }

    const storedRefreshToken = await this.deps.repository.createRefreshToken(
      db,
      refreshTokenInput,
    );

    const accessToken = this.signAccessToken(user);

    return {
      session: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          systemRole: user.systemRole,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
        },
        accessToken,
        accessExpiresAt,
        refreshToken,
        refreshExpiresAt,
      },
      refreshTokenId: storedRefreshToken.id,
    };
  }

  private signAccessToken(user: UserRow): string {
    const expiresIn = this.deps.config.jwtAccessTtl as NonNullable<SignOptions["expiresIn"]>;

    return jsonwebtoken.sign(
      {
        systemRole: user.systemRole,
      },
      this.deps.config.jwtAccessSecret,
      {
        algorithm: "HS256",
        subject: user.id,
        expiresIn,
      },
    );
  }
}
