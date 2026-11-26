import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import type { RealtimeBroker } from "#core/realtime/index";

/**
 * A changed status locks or deletes the account (or lets it in again); a changed system role may
 * take away campaigns an administrator joined without membership. The client connects again and
 * joins with what the account may do now.
 */
const ENDS_CONNECTIONS = new Set(["status", "deletedAt", "systemRole"]);

/**
 * An administrator changed an account: a changed status or system role ends its live connections
 * (they connect again only if the account may still use the app, after
 * `InvalidateAccountCacheHandler` dropped the cached account, with the new role); a changed role
 * also makes the client load the account again.
 */
@EventHandler(historyChangedEventName("user"))
export class PublishAccountChangesHandler extends AbstractEventHandler<HistoryChangedEvent> {
  constructor(private readonly realtime: RealtimeBroker) {
    super();
  }

  async handle(event: HistoryChangedEvent): Promise<void> {
    const userId = event.payload.entityId;
    const fields = event.payload.fields;

    if (fields.includes("systemRole")) {
      // Sent first: the coalesced message goes out after the disconnect, so the client gets it on
      // its new connection only if that one is recovered; the reconnect reloads everything anyway.
      this.realtime.invalidate({ kind: "user", userId }, { resource: "account", campaignId: null });
    }

    if (fields.some((name) => ENDS_CONNECTIONS.has(name))) {
      this.realtime.disconnectUser(userId);
    }
  }
}
