/**
 * Rooms of the realtime gateway. Only the gateway puts sockets into them, after checking the
 * account (`user`) or the campaign role (`campaign…`); senders only name them.
 */

/** Every socket of an account, joined at connect. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Game master and editors of a campaign (and administrators who opened it). */
export function campaignEditorsRoom(campaignId: string): string {
  return `campaign:${campaignId}:editors`;
}

/** Everybody who may open the campaign: players, editors, game master, administrators. */
export function campaignMembersRoom(campaignId: string): string {
  return `campaign:${campaignId}:players`;
}

export function campaignRooms(campaignId: string): string[] {
  return [campaignEditorsRoom(campaignId), campaignMembersRoom(campaignId)];
}

const CAMPAIGN_ROOM = /^campaign:([^:]+):(editors|players)$/;

/** The campaign of a campaign room, else null. */
export function campaignIdOfRoom(room: string): string | null {
  return CAMPAIGN_ROOM.exec(room)?.[1] ?? null;
}
