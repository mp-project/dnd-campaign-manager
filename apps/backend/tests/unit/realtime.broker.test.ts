import {
  CoalescingRealtimeBroker,
  type RealtimeTransport,
} from "#core/realtime/broker";
import type { InvalidateMessage } from "#core/realtime/messages";
import { createRedisRealtimeTransport } from "#core/realtime/redisTransport";
import type { Redis } from "#core/redis/client";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

function recordingTransport() {
  const calls: Array<
    | { type: "invalidate"; room: string; message: InvalidateMessage }
    | { type: "disconnect"; room: string }
    | { type: "leave"; room: string; rooms: string[] }
  > = [];
  const transport: RealtimeTransport = {
    emitInvalidate: (room, message) => calls.push({ type: "invalidate", room, message }),
    disconnect: (room) => calls.push({ type: "disconnect", room }),
    leave: (room, rooms) => calls.push({ type: "leave", room, rooms }),
  };

  return { calls, transport };
}

describe("CoalescingRealtimeBroker", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("sends one invalidate per room, resource and campaign within the window, ids merged", () => {
    const { calls, transport } = recordingTransport();
    const broker = new CoalescingRealtimeBroker(transport, 150);
    const audience = { kind: "campaignEditors", campaignId: CAMPAIGN } as const;

    broker.invalidate(audience, { resource: "campaign-memberships", campaignId: CAMPAIGN, ids: ["b"] });
    broker.invalidate(audience, { resource: "campaign-memberships", campaignId: CAMPAIGN, ids: ["a", "b"] });
    broker.invalidate({ kind: "campaignMembers", campaignId: CAMPAIGN }, { resource: "content-shares", campaignId: CAMPAIGN });
    expect(calls).toEqual([]);

    jest.advanceTimersByTime(150);

    expect(calls).toEqual([
      {
        type: "invalidate",
        room: `campaign:${CAMPAIGN}:editors`,
        message: { resource: "campaign-memberships", campaignId: CAMPAIGN, ids: ["a", "b"] },
      },
      {
        type: "invalidate",
        room: `campaign:${CAMPAIGN}:players`,
        message: { resource: "content-shares", campaignId: CAMPAIGN },
      },
    ]);
  });

  it("drops the ids when one message of the window names none", () => {
    const { calls, transport } = recordingTransport();
    const broker = new CoalescingRealtimeBroker(transport, 150);
    const audience = { kind: "user", userId: "u1" } as const;

    broker.invalidate(audience, { resource: "campaign", campaignId: CAMPAIGN, ids: [CAMPAIGN] });
    broker.invalidate(audience, { resource: "campaign", campaignId: CAMPAIGN });
    broker.invalidate(audience, { resource: "campaign", campaignId: CAMPAIGN, ids: ["x"] });
    jest.advanceTimersByTime(150);

    expect(calls).toEqual([
      { type: "invalidate", room: "user:u1", message: { resource: "campaign", campaignId: CAMPAIGN } },
    ]);
  });

  it("hands leaving and disconnecting on at once, before waiting messages", async () => {
    const { calls, transport } = recordingTransport();
    const broker = new CoalescingRealtimeBroker(transport, 150);

    broker.invalidate({ kind: "user", userId: "u1" }, { resource: "campaign", campaignId: CAMPAIGN });
    broker.leaveCampaign("u1", CAMPAIGN);
    broker.disconnectUser("u2");
    await broker.close();

    expect(calls).toEqual([
      { type: "leave", room: "user:u1", rooms: [`campaign:${CAMPAIGN}:editors`, `campaign:${CAMPAIGN}:players`] },
      { type: "disconnect", room: "user:u2" },
      { type: "invalidate", room: "user:u1", message: { resource: "campaign", campaignId: CAMPAIGN } },
    ]);
  });
});

describe("createRedisRealtimeTransport", () => {
  it("keeps the process running while Redis is away and warns once per failure series", async () => {
    let up = false;
    const sent: unknown[] = [];
    const redis = {
      xadd: async (...args: unknown[]) => {
        if (!up) throw new Error("Connection is closed.");
        sent.push(args);
        return "1-0";
      },
    } as unknown as Redis;
    const warnings: string[] = [];
    const transport = createRedisRealtimeTransport(redis, { warn: (_fields, message) => warnings.push(message) });
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);

    try {
      transport.emitInvalidate("user:a", { resource: "account", campaignId: null });
      transport.disconnect("user:a");
      transport.leave("user:a", ["campaign:x:players"]);
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnings).toHaveLength(1);

      up = true;
      transport.emitInvalidate("user:a", { resource: "account", campaignId: null });
      await new Promise((resolve) => setImmediate(resolve));
      expect(sent).toHaveLength(1);

      up = false;
      transport.emitInvalidate("user:a", { resource: "account", campaignId: null });
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnings).toHaveLength(2);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
