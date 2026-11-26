import type { AppDatabase } from "#core/db/pool";
import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import type { RealtimeBroker } from "#core/realtime/index";
import type { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import { CAMPAIGN_MEMBERSHIP_ENTITY_TYPE } from "#src/modules/campaigns/history/TrackedCampaignMembership";

/**
 * A membership changed (joined, role changed, removed, undone or restored): the member's sockets
 * leave the campaign's rooms and are told to look at the campaign again, so the client loads its
 * role and joins with it (or learns that it lost the campaign). Game master and editors get the
 * member list. Players hear nothing about other members.
 */
@EventHandler(historyChangedEventName(CAMPAIGN_MEMBERSHIP_ENTITY_TYPE))
export class PublishMembershipChangesHandler extends AbstractEventHandler<HistoryChangedEvent> {
  constructor(
    private readonly db: AppDatabase,
    private readonly repository: CampaignMembershipsRepository,
    private readonly realtime: RealtimeBroker,
  ) {
    super();
  }

  async handle(event: HistoryChangedEvent): Promise<void> {
    const campaignId = event.campaignId;

    if (!campaignId) {
      return;
    }

    const userId = await this.repository.findMemberUserId(this.db, event.payload.entityId);

    if (userId) {
      // Leaving goes out at once, the message after the coalescing window: the client asks to
      // join again only after its old rooms are gone.
      this.realtime.leaveCampaign(userId, campaignId);
      this.realtime.invalidate({ kind: "user", userId }, { resource: "campaign", campaignId });
    }

    this.realtime.invalidate(
      { kind: "campaignEditors", campaignId },
      { resource: "campaign-memberships", campaignId, ids: [event.payload.entityId] },
    );
  }
}
