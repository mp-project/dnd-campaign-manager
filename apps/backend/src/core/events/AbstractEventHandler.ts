import type { DomainEvent } from "#core/events/DomainEvent";

/**
 * Reacts to events after the commit (realtime, letters, mail, caches, chronicle), never with domain
 * changes to other modules: those belong into the action itself. A handler names its events with
 * `@EventHandler(...)` and gets its dependencies through the constructor in `Setup.ts`.
 */
export abstract class AbstractEventHandler<E extends DomainEvent = DomainEvent> {
  abstract handle(event: E): Promise<void>;
}
