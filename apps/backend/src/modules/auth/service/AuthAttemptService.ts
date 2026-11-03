import type { AppDatabase } from "#core/db/pool";
import { RateLimitedError } from "#core/error/http/index";
import { normalizeClientIp } from "#core/http/rateLimit";
import type {
  AuthAttemptRow,
  AuthRepository,
} from "#src/modules/auth/domain/repository/AuthRepository";
import { sha256 } from "#src/modules/auth/utils/crypto";

type AuthAttemptPolicy = {
  action: AuthAttemptRow["action"];
  scope: string;
  max: number;
  windowMs: number;
  blockMs: number;
};

export type AuthAttemptKey = {
  policy: AuthAttemptPolicy;
  hash: string;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * IP limits stay high because several users of one session often share a network.
 */
const AUTH_ATTEMPT_POLICIES = {
  loginEmailIp: { action: "LOGIN", scope: "email-ip", max: 10, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  loginEmail: { action: "LOGIN", scope: "email", max: 30, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  loginIp: { action: "LOGIN", scope: "ip", max: 200, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  refreshToken: { action: "REFRESH", scope: "token", max: 10, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  refreshIp: { action: "REFRESH", scope: "ip", max: 200, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  verificationEmail: { action: "EMAIL_VERIFICATION", scope: "email", max: 10, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  verificationIp: { action: "EMAIL_VERIFICATION", scope: "ip", max: 200, windowMs: 15 * MINUTE_MS, blockMs: 15 * MINUTE_MS },
  emailRecipient: { action: "AUTH_EMAIL", scope: "recipient", max: 5, windowMs: HOUR_MS, blockMs: HOUR_MS },
  emailIp: { action: "AUTH_EMAIL", scope: "ip", max: 100, windowMs: HOUR_MS, blockMs: HOUR_MS },
} as const satisfies Record<string, AuthAttemptPolicy>;

function buildKey(policy: AuthAttemptPolicy, value: string): AuthAttemptKey {
  return { policy, hash: sha256(`${policy.action}:${policy.scope}:${value}`) };
}

function ipValue(ip: string | undefined): string {
  return ip ? normalizeClientIp(ip) : "unknown";
}

export function loginAttemptKeys(email: string, ip: string | undefined) {
  const { loginEmailIp, loginEmail, loginIp } = AUTH_ATTEMPT_POLICIES;

  return {
    emailIp: buildKey(loginEmailIp, `${email}|${ipValue(ip)}`),
    all: [
      buildKey(loginEmailIp, `${email}|${ipValue(ip)}`),
      buildKey(loginEmail, email),
      buildKey(loginIp, ipValue(ip)),
    ],
  };
}

export function refreshAttemptKeys(tokenHash: string, ip: string | undefined): AuthAttemptKey[] {
  const { refreshToken, refreshIp } = AUTH_ATTEMPT_POLICIES;

  return [buildKey(refreshToken, tokenHash), buildKey(refreshIp, ipValue(ip))];
}

export function verificationAttemptKeys(email: string, ip: string | undefined): AuthAttemptKey[] {
  const { verificationEmail, verificationIp } = AUTH_ATTEMPT_POLICIES;

  return [buildKey(verificationEmail, email), buildKey(verificationIp, ipValue(ip))];
}

export function authEmailAttemptKeys(email: string, ip: string | undefined): AuthAttemptKey[] {
  const { emailRecipient, emailIp } = AUTH_ATTEMPT_POLICIES;

  return [buildKey(emailRecipient, email), buildKey(emailIp, ipValue(ip))];
}

/**
 * Counts auth attempts and blocks keys that reached their limit. It always uses its own
 * connection: failed attempts must survive the rollback of the request transaction. Call it
 * outside of transactions, so a request never holds two connections at once.
 */
export class AuthAttemptService {
  constructor(
    private readonly db: AppDatabase,
    private readonly repository: AuthRepository,
  ) {}

  /**
   * Rejects a blocked request up front and counts the errors selected by `isFailure`.
   */
  async trackFailures<T>(
    keys: AuthAttemptKey[],
    isFailure: (error: unknown) => boolean,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.assertNotBlocked(keys);

    try {
      return await work();
    } catch (error) {
      if (isFailure(error)) {
        await this.record(keys);
      }

      throw error;
    }
  }

  /**
   * Counts every request, for actions that are costly even when they succeed (sending email).
   */
  async consume(keys: AuthAttemptKey[]): Promise<void> {
    await this.assertNotBlocked(keys);
    await this.record(keys);
  }

  clear(key: AuthAttemptKey): Promise<void> {
    return this.repository.deleteAttempt(this.db, key.hash);
  }

  private async assertNotBlocked(keys: AuthAttemptKey[]): Promise<void> {
    const now = new Date();
    const blockedUntil = await this.repository.findAttemptBlockedUntil(
      this.db,
      keys.map((key) => key.hash),
      now,
    );

    if (blockedUntil) {
      throw new RateLimitedError("Too many attempts, please try again later", {
        retryAfterSeconds: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000),
      });
    }
  }

  private async record(keys: AuthAttemptKey[]): Promise<void> {
    const now = new Date();

    await this.repository.deleteExpiredAttempts(this.db, now);

    for (const { policy, hash } of keys) {
      await this.repository.updateAttempt(this.db, {
        keyHash: hash,
        action: policy.action,
        max: policy.max,
        now,
        windowExpiresAt: new Date(now.getTime() + policy.windowMs),
        blockedUntil: new Date(now.getTime() + policy.blockMs),
      });
    }
  }
}
