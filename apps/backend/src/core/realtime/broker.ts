import type { InvalidateMessage } from "#core/realtime/messages";
import {
  campaignEditorsRoom,
  campaignMembersRoom,
  campaignRooms,
  userRoom,
} from "#core/realtime/rooms";

/** Who gets a message. The sender picks it; the gateway decided who is in each room. */
export type RealtimeAudience =
  | { kind: "user"; userId: string }
  /** Game master, editors and administrators of the campaign. */
  | { kind: "campaignEditors"; campaignId: string }
  /** Everybody in the campaign, players included: only what every member may know. */
  | { kind: "campaignMembers"; campaignId: string };

/**
 * Sends to the realtime gateway from the API and the workers (`container.ports.realtime`).
 * Best effort after the commit, like the event bus: nothing waits for it and a failure loses only
 * a live update (clients load again when they reconnect). Handlers know nothing about Socket.IO.
 */
export interface RealtimeBroker {
  /**
   * Tells the audience that a resource changed. Messages to the same room, resource and campaign
   * within a short window are sent once, with their ids merged.
   */
  invalidate(audience: RealtimeAudience, message: InvalidateMessage): void;
  /** Ends every connection of the account, on every gateway instance. */
  disconnectUser(userId: string): void;
  /** Takes the account's sockets out of the campaign's rooms; the client joins again if it still may. */
  leaveCampaign(userId: string, campaignId: string): void;
  /** Sends what is still waiting; at shutdown. */
  close(): Promise<void>;
}

/** What a broker hands to the gateway; one call per room. */
export interface RealtimeTransport {
  emitInvalidate(room: string, message: InvalidateMessage): void;
  disconnect(room: string): void;
  leave(room: string, rooms: string[]): void;
}

export function roomOf(audience: RealtimeAudience): string {
  switch (audience.kind) {
    case "user":
      return userRoom(audience.userId);
    case "campaignEditors":
      return campaignEditorsRoom(audience.campaignId);
    case "campaignMembers":
      return campaignMembersRoom(audience.campaignId);
  }
}

/** One action often changes many rows; their messages go out once per window. */
export const INVALIDATE_COALESCE_MS = 150;

type Pending = { room: string; message: InvalidateMessage; ids: Set<string> | null };

/**
 * Coalesces `invalidate` per room, resource and campaign and hands everything else on at once.
 * Leaving and disconnecting are not delayed, so they always arrive before the `invalidate` that
 * tells the client to look again.
 */
export class CoalescingRealtimeBroker implements RealtimeBroker {
  private readonly pending = new Map<string, Pending>();

  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly delayMs = INVALIDATE_COALESCE_MS,
  ) {}

  invalidate(audience: RealtimeAudience, message: InvalidateMessage): void {
    const room = roomOf(audience);
    const key = `${room}|${message.resource}|${message.campaignId ?? ""}`;
    const entry = this.pending.get(key);

    if (entry) {
      // Without ids the message means "anything of this resource", which covers every id.
      if (!message.ids) {
        entry.ids = null;
      } else {
        message.ids.forEach((id) => entry.ids?.add(id));
      }
    } else {
      this.pending.set(key, {
        room,
        message: { resource: message.resource, campaignId: message.campaignId },
        ids: message.ids ? new Set(message.ids) : null,
      });
    }

    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
    // A pending message must not keep a script or test process alive.
    this.timer.unref();
  }

  disconnectUser(userId: string): void {
    this.transport.disconnect(userRoom(userId));
  }

  leaveCampaign(userId: string, campaignId: string): void {
    this.transport.leave(userRoom(userId), campaignRooms(campaignId));
  }

  async close(): Promise<void> {
    this.flush();
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const entries = [...this.pending.values()];
    this.pending.clear();

    for (const { room, message, ids } of entries) {
      this.transport.emitInvalidate(room, ids ? { ...message, ids: [...ids].sort() } : message);
    }
  }
}

/** Without Redis nothing reaches the gateway, so nothing is sent. */
export const NOOP_REALTIME_TRANSPORT: RealtimeTransport = {
  emitInvalidate: () => undefined,
  disconnect: () => undefined,
  leave: () => undefined,
};
