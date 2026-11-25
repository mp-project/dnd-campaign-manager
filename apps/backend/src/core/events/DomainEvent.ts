/**
 * Something that happened, valid once its action committed. Events carry ids and field names, no
 * content values, so a handler can't pass on what its audience may not see; it loads what it needs.
 */
export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly id: string;
  /** `<module>.<entity>.<verb in the past>`, e.g. `items.instance.transferred`. */
  readonly name: TName;
  readonly occurredAt: Date;
  readonly campaignId: string | null;
  readonly actorId: string | null;
  readonly payload: TPayload;
}

/** What a use case hands to `scope.emit`; the scope adds id, time and actor. */
export type EmittedEvent<E extends DomainEvent = DomainEvent> = Pick<
  E,
  "name" | "campaignId" | "payload"
>;

const NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-zA-Z0-9-]*)+$/;

/** Event names have at least two dot-separated segments; patterns may use `*` for one segment. */
export function assertEventName(name: string, allowWildcard = false): void {
  const checked = allowWildcard ? name.replaceAll("*", "x") : name;

  if (!NAME_PATTERN.test(checked)) {
    throw new Error(`Invalid event name '${name}'`);
  }
}
