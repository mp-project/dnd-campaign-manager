import type { HistoryChangedEvent } from "#core/history/events";
import type { RealtimeBroker } from "#core/realtime/index";
import { PublishAccountChangesHandler } from "#src/modules/auth/events/PublishAccountChangesHandler";
import { PublishCampaignChangesHandler } from "#src/modules/campaigns/events/PublishCampaignChangesHandler";
import type { ContentShareChangedEvent } from "#src/modules/content-shares/events/ContentShareChangedEvent";
import { PublishShareChangesHandler } from "#src/modules/content-shares/events/PublishShareChangesHandler";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

function recordingBroker() {
  const broker = {
    invalidate: jest.fn(),
    disconnectUser: jest.fn(),
    leaveCampaign: jest.fn(),
    close: jest.fn(),
  } satisfies RealtimeBroker;

  return broker;
}

function historyEvent(entityType: string, fields: string[], campaignId: string | null): HistoryChangedEvent {
  return {
    id: "e1",
    name: `history.${entityType}.changed`,
    occurredAt: new Date(),
    campaignId,
    actorId: "admin",
    payload: {
      eventId: "e1",
      actionId: "a1",
      action: `${entityType}.update`,
      entityType,
      entityId: "entity-1",
      entityVersion: 2,
      campaignId,
      actorId: "admin",
      fields,
    },
  };
}

describe("realtime handlers", () => {
  it("end an account's connections when its status or system role changes", async () => {
    const broker = recordingBroker();
    const handler = new PublishAccountChangesHandler(broker);

    await handler.handle(historyEvent("user", ["status"], null));
    await handler.handle(historyEvent("user", ["systemRole"], null));
    await handler.handle(historyEvent("user", ["displayName"], null));

    expect(broker.disconnectUser).toHaveBeenCalledTimes(2);
    expect(broker.disconnectUser).toHaveBeenCalledWith("entity-1");
    expect(broker.invalidate).toHaveBeenCalledTimes(1);
    expect(broker.invalidate).toHaveBeenCalledWith(
      { kind: "user", userId: "entity-1" },
      { resource: "account", campaignId: null },
    );
  });

  it("tell every member of the campaign when it changes", async () => {
    const broker = recordingBroker();

    await new PublishCampaignChangesHandler(broker).handle(historyEvent("campaign", ["name"], CAMPAIGN));

    expect(broker.invalidate).toHaveBeenCalledWith(
      { kind: "campaignMembers", campaignId: CAMPAIGN },
      { resource: "campaign", campaignId: CAMPAIGN, ids: [CAMPAIGN] },
    );
  });

  it("tell the campaign about changed shares without naming them", async () => {
    const broker = recordingBroker();
    const handler = new PublishShareChangesHandler(broker);
    const created: ContentShareChangedEvent = {
      id: "e2",
      name: "content-shares.share.created",
      occurredAt: new Date(),
      campaignId: CAMPAIGN,
      actorId: "gm",
      payload: { shareId: "share-1" },
    };

    await handler.handle(created);
    await handler.handle(historyEvent("asset", ["status"], CAMPAIGN));
    // Renaming content ends no share; global content has no campaign.
    await handler.handle(historyEvent("asset", ["name"], CAMPAIGN));
    await handler.handle(historyEvent("asset", ["status"], null));

    expect(broker.invalidate).toHaveBeenCalledTimes(2);
    expect(broker.invalidate).toHaveBeenNthCalledWith(
      1,
      { kind: "campaignMembers", campaignId: CAMPAIGN },
      { resource: "content-shares", campaignId: CAMPAIGN },
    );
  });
});
