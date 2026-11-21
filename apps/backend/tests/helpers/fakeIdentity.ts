import type { FastifyRequest } from "fastify";

import type { ExternalIdentity, ExternalUser, IdentityPort } from "#core/auth/identity";

const TOKEN_PREFIX = "test-identity:";

/** The bearer token the fake accepts for an identity (a provider user id). */
export function testIdentityToken(externalUserId: string, sessionId = "sess_test"): string {
  return `${TOKEN_PREFIX}${externalUserId}:${sessionId}`;
}

/**
 * Stands in for Clerk: accepts `test-identity:<user>:<session>` tokens, serves the accounts a
 * test puts into `users` and records what the app asked the provider to do.
 */
export class FakeIdentityPort implements IdentityPort {
  readonly users = new Map<string, ExternalUser>();
  readonly calls: Array<{ action: "lock" | "unlock"; externalUserId: string }> = [];
  loadCount = 0;

  async authenticate(request: FastifyRequest): Promise<ExternalIdentity | null> {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (!token.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const [externalUserId, sessionId] = token.slice(TOKEN_PREFIX.length).split(":");

    return externalUserId && sessionId ? { externalUserId, sessionId } : null;
  }

  async loadUser(externalUserId: string): Promise<ExternalUser | null> {
    this.loadCount += 1;

    return this.users.get(externalUserId) ?? null;
  }

  addUser(user: Partial<ExternalUser> & { externalUserId: string; email: string }): ExternalUser {
    const full: ExternalUser = {
      emailVerified: true,
      displayName: null,
      locale: null,
      timezone: null,
      ...user,
    };

    this.users.set(full.externalUserId, full);

    return full;
  }

  async lockUser(externalUserId: string): Promise<void> {
    this.calls.push({ action: "lock", externalUserId });
  }

  async unlockUser(externalUserId: string): Promise<void> {
    this.calls.push({ action: "unlock", externalUserId });
  }
}
