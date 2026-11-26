import type { DomainEvent } from "#core/events/DomainEvent";

export type ContentShareChange = "created" | "updated" | "revoked";

/**
 * A GM created, changed or revoked a share. Shares have no history, so their use cases publish
 * this after the commit themselves. Carries the share's id only.
 */
export type ContentShareChangedEvent = DomainEvent<
  `content-shares.share.${ContentShareChange}`,
  { shareId: string }
>;
