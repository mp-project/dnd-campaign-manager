import type { DomainEvent } from "#core/events/DomainEvent";
import type { HistoryEvent } from "#core/history/types";

/**
 * Every recorded change also goes out as `history.<entityType>.changed`, so live updates and
 * caches of tracked content need no events of their own. Like the history event it carries field
 * names, never values.
 */
export type HistoryChangedEvent = DomainEvent<`history.${string}.changed`, HistoryEvent>;

export function historyChangedEventName(entityType: string): `history.${string}.changed` {
  return `history.${entityType}.changed`;
}

export function toHistoryChangedEvent(event: HistoryEvent, occurredAt: Date): HistoryChangedEvent {
  return {
    id: event.eventId,
    name: historyChangedEventName(event.entityType),
    occurredAt,
    campaignId: event.campaignId,
    actorId: event.actorId,
    payload: event,
  };
}
