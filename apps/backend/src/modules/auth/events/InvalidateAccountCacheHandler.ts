import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import type { AccountCache } from "#src/modules/auth/service/AccountCache";

/**
 * Drops the cached account after every tracked change of a user: an administrator's change of
 * role or status (including deleting, which disables), undoing and restoring one. Every field
 * counts, not only role and status, so a field added later can't be forgotten here; a dropped
 * entry only costs one query. The account service drops its own direct writes itself.
 */
@EventHandler(historyChangedEventName("user"))
export class InvalidateAccountCacheHandler extends AbstractEventHandler<HistoryChangedEvent> {
  constructor(private readonly cache: AccountCache) {
    super();
  }

  async handle(event: HistoryChangedEvent): Promise<void> {
    await this.cache.invalidate(event.payload.entityId);
  }
}
