import { createClerkClient, verifyToken, type ClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import type { FastifyRequest } from "fastify";

import type { ExternalIdentity, ExternalUser, IdentityPort } from "#core/auth/identity";
import { ServiceUnavailableError } from "#core/error/http/index";
import { warnFallback } from "#core/log/warnFallback";

/** The parts of a Clerk user (API resource or webhook payload) the app reads. */
export type ClerkUserJson = {
  id: string;
  primary_email_address_id: string | null;
  email_addresses: ReadonlyArray<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  locale?: string | null;
  timezone?: string | null;
  unsafe_metadata?: Record<string, unknown> | null;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Maps a Clerk user to what the app copies. Language and time zone come from Clerk's own fields,
 * else from what the sign-up form put into `unsafeMetadata`; the account service checks both.
 */
export function toExternalUser(user: ClerkUserJson): ExternalUser {
  const primary = user.email_addresses.find(
    (address) => address.id === user.primary_email_address_id,
  );
  const fullName = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return {
    externalUserId: user.id,
    email: primary?.email_address ?? null,
    emailVerified: primary?.verification?.status === "verified",
    displayName: fullName || stringOrNull(user.username),
    locale: stringOrNull(user.locale) ?? stringOrNull(user.unsafe_metadata?.locale),
    timezone: stringOrNull(user.timezone) ?? stringOrNull(user.unsafe_metadata?.timezone),
  };
}

function isNotFound(error: unknown): boolean {
  return isClerkAPIResponseError(error) && error.status === 404;
}

/**
 * Clerk as identity provider. Session tokens are verified locally (with `CLERK_JWT_KEY`, else
 * against the instance's cached JWKS); only loading, locking and deleting an account call Clerk's API.
 */
export class ClerkIdentityPort implements IdentityPort {
  private readonly client: ClerkClient;

  constructor(
    private readonly options: {
      secretKey: string;
      jwtKey?: string | undefined;
      authorizedParties: string[];
    },
  ) {
    this.client = createClerkClient({ secretKey: options.secretKey });
  }

  async authenticate(request: FastifyRequest): Promise<ExternalIdentity | null> {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

    if (!token) {
      return null;
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: this.options.secretKey,
        ...(this.options.jwtKey ? { jwtKey: this.options.jwtKey } : {}),
        authorizedParties: this.options.authorizedParties,
      });

      // A pending session still has tasks to finish at Clerk (e.g. choosing a password).
      if (payload.sts === "pending" || !payload.sub || !payload.sid) {
        return null;
      }

      return { externalUserId: payload.sub, sessionId: payload.sid };
    } catch {
      // An invalid, expired or foreign token is no identity; routes that need one answer 401.
      return null;
    }
  }

  async loadUser(externalUserId: string): Promise<ExternalUser | null> {
    try {
      const user = await this.client.users.getUser(externalUserId);

      return user.raw ? toExternalUser(user.raw) : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }

      throw new ServiceUnavailableError("Identity provider not reachable", undefined, {
        cause: error,
      });
    }
  }

  async lockUser(externalUserId: string): Promise<void> {
    // Banning ends the account's sessions and keeps it from signing in until it is lifted.
    await this.call(() => this.client.users.banUser(externalUserId), externalUserId);
  }

  async unlockUser(externalUserId: string): Promise<void> {
    await this.call(() => this.client.users.unbanUser(externalUserId), externalUserId);
  }

  private async call(run: () => Promise<unknown>, externalUserId: string): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (isNotFound(error)) {
        // Already gone at Clerk; there is nothing left to lock.
        warnFallback(error, "Clerk account not found", { externalUserId });
        return;
      }

      throw new ServiceUnavailableError("Identity provider not reachable", undefined, {
        cause: error,
      });
    }
  }
}
