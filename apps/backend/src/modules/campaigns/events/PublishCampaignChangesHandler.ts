import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import type { RealtimeBroker } from "#core/realtime/index";
import { CAMPAIGN_ENTITY_TYPE } from "#src/modules/campaigns/history/TrackedCampaign";

/**
 * A campaign's settings changed (name, status, owner …): every member reloads it. Every member may
 * read the campaign itself, so the whole campaign hears it.
 */
@EventHandler(historyChangedEventName(CAMPAIGN_ENTITY_TYPE))
export class PublishCampaignChangesHandler extends AbstractEventHandler<HistoryChangedEvent> {
  constructor(private readonly realtime: RealtimeBroker) {
    super();
  }

  async handle(event: HistoryChangedEvent): Promise<void> {
    const campaignId = event.campaignId ?? event.payload.entityId;

    this.realtime.invalidate(
      { kind: "campaignMembers", campaignId },
      { resource: "campaign", campaignId, ids: [campaignId] },
    );
  }
}
