import type { SystemRole } from "#core/permissions/roles";

/** A session the identity provider confirmed. */
export type ExternalIdentity = {
  /** The provider's user id (Clerk: `user_…`). */
  externalUserId: string;
  /** The provider's session id (Clerk: `sess_…`). */
  sessionId: string;
  /** When the session token runs out; null for tokens without expiry (tests). */
  expiresAt: Date | null;
};

/** What the app copies from the identity provider into its own `users` row. */
export type ExternalUser = {
  externalUserId: string;
  /** Primary address; null when the account has none (the app then can't create a local user). */
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  /** The browser's language and time zone at sign-up; checked before they are stored. */
  locale: string | null;
  timezone: string | null;
};

/**
 * The identity provider (Clerk in production, a fake in tests). It confirms sessions and keeps
 * the provider's side of a lock in step with the app; it decides no rights.
 */
export type IdentityPort = {
  /**
   * Checks a session token (API requests: the bearer token; realtime: the handshake's token);
   * null when it is not valid.
   */
  verifyToken(token: string): Promise<ExternalIdentity | null>;
  /** Loads the provider's account; null when it doesn't exist (any more). */
  loadUser(externalUserId: string): Promise<ExternalUser | null>;
  /** Locks the account at the provider and ends its sessions. */
  lockUser(externalUserId: string): Promise<void>;
  unlockUser(externalUserId: string): Promise<void>;
};

/** The local account behind a confirmed identity. */
export type ResolvedActor = {
  actorId: string;
  systemRole: SystemRole;
};

/**
 * Maps a confirmed identity to the local account, creating it on the first request. Returns null
 * when the account may not use the app (locked, disabled, deleted).
 */
export type AccountPort = {
  resolveActor(identity: ExternalIdentity): Promise<ResolvedActor | null>;
};
