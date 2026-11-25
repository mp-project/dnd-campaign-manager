import type { CacheStore } from "#core/cache/port";
import type { SystemRole } from "#core/permissions/roles";
import type { AccountRow } from "#src/modules/auth/domain/repository/AccountRepository";

/** What a request needs to know about its account; never more (no address, no name). */
export type CachedAccount = {
  userId: string;
  systemRole: SystemRole;
  status: AccountRow["status"];
};

/**
 * Rights-relevant, so short: an invalidation that is lost (Redis away, an API instance without
 * Redis, a request that read the old row just before a change and stores it just after) only
 * ends with the entry.
 */
export const ACCOUNT_CACHE_TTL_SECONDS = 30;

// The version in the key lets a deploy that changes `CachedAccount` ignore older entries.
const KEY_PREFIX = "auth:account:v1:";

function keyOf(externalUserId: string): string {
  return `${KEY_PREFIX}${externalUserId}`;
}

/** Entries are found by identity but dropped by account, because changes name the account. */
function tagOf(userId: string): string {
  return `auth:account:user:${userId}`;
}

/**
 * The account behind a provider identity, so a request needs no database query to know who it
 * is. Shared through Redis when the app has one, else per process.
 */
export class AccountCache {
  constructor(private readonly store: CacheStore) {}

  async get(externalUserId: string): Promise<CachedAccount | undefined> {
    return this.store.get<CachedAccount>(keyOf(externalUserId));
  }

  async set(externalUserId: string, account: AccountRow): Promise<void> {
    const value: CachedAccount = {
      userId: account.id,
      systemRole: account.systemRole,
      status: account.status,
    };

    await this.store.set(keyOf(externalUserId), value, {
      ttlSeconds: ACCOUNT_CACHE_TTL_SECONDS,
      tags: [tagOf(account.id)],
    });
  }

  /** After every change of the account's row, whoever made it. */
  async invalidate(userId: string): Promise<void> {
    await this.store.invalidateTags(tagOf(userId));
  }
}
