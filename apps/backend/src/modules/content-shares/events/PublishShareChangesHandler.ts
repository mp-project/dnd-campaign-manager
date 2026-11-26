import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import type { RealtimeBroker } from "#core/realtime/index";
import type { ContentShareChangedEvent } from "#src/modules/content-shares/events/ContentShareChangedEvent";

/**
 * Tells the campaign that its shares changed, so players see a new share without polling. The
 * message names no share: a share may be meant for some players only, and every member hears it;
 * the client loads its list, where the API decides. Content that leaves ACTIVE ends its shares
 * (deactivate hook), which shows as a status change of the asset.
 */
@EventHandler("content-shares.share.*", historyChangedEventName("asset"))
export class PublishShareChangesHandler extends AbstractEventHandler<
  ContentShareChangedEvent | HistoryChangedEvent
> {
  constructor(private readonly realtime: RealtimeBroker) {
    super();
  }

  async handle(event: ContentShareChangedEvent | HistoryChangedEvent): Promise<void> {
    const campaignId = event.campaignId;

    if (!campaignId) {
      return;
    }

    if (event.name.startsWith("history.") && !(event as HistoryChangedEvent).payload.fields.includes("status")) {
      return;
    }

    this.realtime.invalidate({ kind: "campaignMembers", campaignId }, { resource: "content-shares", campaignId });
  }
}
