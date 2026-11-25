import type {
  AccountPort,
  ExternalIdentity,
  ExternalUser,
  IdentityPort,
  ResolvedActor,
} from "#core/auth/identity";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { recordChange } from "#core/log/auditLog";
import { warnFallback } from "#core/log/warnFallback";
import { SYSTEM_ROLE, type SystemRole } from "#core/permissions/roles";
import {
  AccountRepository,
  type AccountRow,
} from "#src/modules/auth/domain/repository/AccountRepository";
import type { AccountCache } from "#src/modules/auth/service/AccountCache";
import { generateUniqueUserTag, usernameFromDisplayName } from "#src/modules/auth/service/UserTag";
import {
  UserBaseSchema,
  UserSettingsBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

const localeDto = UserSettingsBaseSchema.shape.locale.optional().catch(undefined);
const timezoneDto = UserSettingsBaseSchema.shape.timezone.optional().catch(undefined);
const displayNameDto = UserBaseSchema.shape.displayName.optional().catch(undefined);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A display name for a new account: the provider's name, else the address before the `@`. */
function initialDisplayName(user: ExternalUser, email: string): string {
  const name = displayNameDto.parse(user.displayName ?? undefined);

  return name ?? (email.split("@")[0]?.slice(0, 120) || "Player");
}

type ProvisionResult = {
  account: AccountRow;
  change: "created" | "linked" | null;
  /** An unconfirmed account from before the provider that gave up the address. */
  retiredUserId?: string;
};

/**
 * How long an identity that got no account is not asked for again: without this, every request of
 * such a session (no address, address taken, provider account gone) would call the provider's API.
 */
const REFUSAL_TTL_MS = 5 * 60_000;
const REFUSAL_LIMIT = 10_000;

/**
 * The local account behind a provider identity. `users.id` stays the key everywhere; the provider
 * id links the two (`users.clerk_user_id`). Role and status are only ever read from here.
 */
export class AccountService implements AccountPort {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: AccountRepository,
    private readonly identityPort: IdentityPort | undefined,
    private readonly cache: AccountCache,
    private readonly options: { bootstrapMaintainerEmail: string | undefined },
  ) {}

  /** Identities that got no account, until when they are refused without asking the provider. */
  private readonly refusedUntil = new Map<string, number>();

  /**
   * A known account comes from the cache, else with one query. On the first request of a new
   * identity the account is created (or a local account with the same verified address and no
   * identity yet is linked), because the webhook arrives late or, locally, not at all. Identities
   * without an account are not cached, so the next request can still create it.
   */
  async resolveActor(identity: ExternalIdentity): Promise<ResolvedActor | null> {
    const cached = await this.cache.get(identity.externalUserId);

    if (cached) {
      return cached.status === "ACTIVE"
        ? { actorId: cached.userId, systemRole: cached.systemRole }
        : null;
    }

    const known = await this.repository.findByClerkUserId(this.db, identity.externalUserId);
    const account = known ?? (await this.provisionUnlessRefused(identity.externalUserId));

    if (!account) {
      return null;
    }

    await this.cache.set(identity.externalUserId, account);

    return account.status === "ACTIVE"
      ? { actorId: account.id, systemRole: account.systemRole }
      : null;
  }

  /**
   * `user.created` / `user.updated`: creates the account if needed, else copies the address. The
   * provider's current state counts, not the event's: a retried older event arriving after a newer
   * one must not bring back an address that was removed since. A user gone at the provider is left
   * to `user.deleted`.
   */
  async syncUser(event: ExternalUser): Promise<void> {
    const user = this.identityPort ? await this.identityPort.loadUser(event.externalUserId) : event;

    if (!user) {
      return;
    }

    this.refusedUntil.delete(user.externalUserId);

    const known = await this.repository.findByClerkUserId(this.db, user.externalUserId);

    if (!known) {
      await this.provision(user);
      return;
    }

    const email = user.email ? normalizeEmail(user.email) : null;

    // Only a verified address replaces the copy: invitations by email trust it.
    if (!email || !user.emailVerified) {
      return;
    }

    if (email === known.email && known.emailVerifiedAt) {
      return;
    }

    const holder = await this.repository.findByEmail(this.db, email);

    if (holder && holder.id !== known.id) {
      warnFallback(null, "Provider address already belongs to another account", {
        userId: known.id,
        otherUserId: holder.id,
      });
      return;
    }

    await this.repository.update(this.db, known.id, {
      email,
      emailVerifiedAt: known.emailVerifiedAt ?? new Date(),
    });
    recordChange({
      action: "auth.syncAccount",
      entities: [{ entityType: "user", entityId: known.id, fields: ["email", "emailVerifiedAt"] }],
      actorId: known.id,
    });
  }

  /**
   * `user.deleted`: the account can't sign in any more. The local row stays (memberships, history,
   * owned campaigns) as DISABLED and loses its link. Signing up again with the address links this
   * disabled account, which stays refused until an administrator activates it (the frontend says
   * so); its data comes back with it.
   */
  async markDeleted(externalUserId: string): Promise<void> {
    const known = await this.repository.findByClerkUserId(this.db, externalUserId);

    if (!known) {
      return;
    }

    await this.repository.update(this.db, known.id, { status: "DISABLED", clerkUserId: null });
    await this.cache.invalidate(known.id);
    recordChange({
      action: "auth.deleteAccount",
      entities: [{ entityType: "user", entityId: known.id, fields: ["status", "clerkUserId"] }],
      actorId: known.id,
      security: true,
    });
  }

  /** `session.created`: remembers the sign-in. */
  async recordSignIn(externalUserId: string): Promise<void> {
    const known = await this.repository.findByClerkUserId(this.db, externalUserId);

    if (known) {
      await this.repository.update(this.db, known.id, { lastLoginAt: new Date() });
    }
  }

  private async provisionUnlessRefused(externalUserId: string): Promise<AccountRow | null> {
    const now = Date.now();

    if ((this.refusedUntil.get(externalUserId) ?? 0) > now) {
      return null;
    }

    const user = await this.identityPort?.loadUser(externalUserId);
    const account = user ? await this.provision(user) : null;

    if (account) {
      this.refusedUntil.delete(externalUserId);
    } else {
      if (this.refusedUntil.size >= REFUSAL_LIMIT) {
        this.refusedUntil.clear();
      }
      this.refusedUntil.set(externalUserId, now + REFUSAL_TTL_MS);
    }

    return account;
  }

  private async provision(user: ExternalUser): Promise<AccountRow | null> {
    if (!user.email) {
      warnFallback(null, "Provider account without an address; no local account", {
        externalUserId: user.externalUserId,
      });
      return null;
    }

    const email = normalizeEmail(user.email);
    const result = await this.transactionManager.inTransaction((tx) =>
      this.provisionInTransaction(tx, user, email),
    );

    if (!result) {
      return null;
    }

    // Neither row had an identity before, so no entry can name it; dropped anyway, so every direct
    // write of this service drops what it changed.
    await this.cache.invalidate(result.account.id);

    if (result.retiredUserId) {
      await this.cache.invalidate(result.retiredUserId);
      recordChange({
        action: "auth.retireUnverifiedAccount",
        entities: [{ entityType: "user", entityId: result.retiredUserId, fields: ["status", "deletedAt"] }],
        actorId: result.retiredUserId,
        security: true,
      });
    }

    if (result.change) {
      recordChange({
        action: result.change === "created" ? "auth.createAccount" : "auth.linkAccount",
        entities: [
          {
            entityType: "user",
            entityId: result.account.id,
            fields:
              result.change === "created"
                ? ["email", "displayName", "systemRole", "clerkUserId"]
                : ["clerkUserId", "emailVerifiedAt", "systemRole"],
          },
        ],
        actorId: result.account.id,
        security: result.account.systemRole !== SYSTEM_ROLE.USER,
      });
    }

    return result.account;
  }

  private async provisionInTransaction(
    tx: AppDatabase,
    user: ExternalUser,
    email: string,
  ): Promise<ProvisionResult | null> {
    const existing = await this.repository.findByClerkUserId(tx, user.externalUserId);

    if (existing) {
      return { account: existing, change: null };
    }

    const holder = await this.repository.findByEmail(tx, email);
    let retiredUserId: string | undefined;

    if (holder?.clerkUserId === user.externalUserId) {
      // A parallel first request committed this identity's account between the two lookups; it is
      // this account, not one of another identity.
      return { account: holder, change: null };
    }

    if (holder && this.isUnprovenLegacy(holder, user)) {
      // Nobody ever proved the mailbox of this account (a registration from before the provider
      // that was never confirmed), so the owner who proved it now must not inherit it: it is
      // retired, and the owner gets an account of their own.
      await this.repository.update(tx, holder.id, { status: "DISABLED", deletedAt: new Date() });
      retiredUserId = holder.id;
    } else if (holder) {
      return this.linkExisting(tx, holder, user, email);
    }

    const displayName = initialDisplayName(user, email);
    const username = usernameFromDisplayName(displayName);
    const userTag = await generateUniqueUserTag(username, (candidate) =>
      this.repository.userTagExists(tx, candidate),
    );
    const created = await this.repository.create(tx, {
      clerkUserId: user.externalUserId,
      email,
      emailVerifiedAt: user.emailVerified ? new Date() : null,
      displayName,
      username,
      userTag,
      systemRole: await this.initialRole(tx, user, email),
    });

    if (!created) {
      // A parallel first request (or the webhook) created it; that one is the account.
      const winner = await this.repository.findByClerkUserId(tx, user.externalUserId);

      return winner ? { account: winner, change: null } : null;
    }

    await this.repository.createSettings(tx, {
      userId: created.id,
      locale: localeDto.parse(user.locale ?? undefined),
      timezone: timezoneDto.parse(user.timezone ?? undefined),
    });

    return { account: created, change: "created", ...(retiredUserId ? { retiredUserId } : {}) };
  }

  private isUnprovenLegacy(holder: AccountRow, user: ExternalUser): boolean {
    return (
      holder.clerkUserId === null &&
      holder.emailVerifiedAt === null &&
      user.emailVerified &&
      holder.systemRole === SYSTEM_ROLE.USER
    );
  }

  /**
   * A local account with the same address and no identity (from before the provider, or one whose
   * provider account was deleted) is linked, but only for a verified address: the provider proved
   * the mailbox. An account linked to another identity is never taken over.
   */
  private async linkExisting(
    tx: AppDatabase,
    holder: AccountRow,
    user: ExternalUser,
    email: string,
  ): Promise<ProvisionResult | null> {
    if (holder.clerkUserId !== null || !user.emailVerified) {
      warnFallback(null, "Address belongs to another local account; not linked", {
        externalUserId: user.externalUserId,
        userId: holder.id,
      });
      return null;
    }

    const role = await this.initialRole(tx, user, email);
    const linked = await this.repository.update(tx, holder.id, {
      clerkUserId: user.externalUserId,
      emailVerifiedAt: holder.emailVerifiedAt ?? new Date(),
      lastLoginAt: new Date(),
      ...(role !== SYSTEM_ROLE.USER && holder.systemRole === SYSTEM_ROLE.USER
        ? { systemRole: role }
        : {}),
    });

    return linked ? { account: linked, change: "linked" } : null;
  }

  /**
   * The first system maintainer comes from `BOOTSTRAP_MAINTAINER_EMAIL`, only while there is none,
   * so a forgotten setting can't hand out the role later.
   */
  private async initialRole(tx: AppDatabase, user: ExternalUser, email: string): Promise<SystemRole> {
    const bootstrap = this.options.bootstrapMaintainerEmail;

    if (
      bootstrap &&
      user.emailVerified &&
      normalizeEmail(bootstrap) === email &&
      (await this.repository.countActiveWithRole(tx, SYSTEM_ROLE.SYSTEM_MAINTAINER)) === 0
    ) {
      return SYSTEM_ROLE.SYSTEM_MAINTAINER;
    }

    return SYSTEM_ROLE.USER;
  }
}
