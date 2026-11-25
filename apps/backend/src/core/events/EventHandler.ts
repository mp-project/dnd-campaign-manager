import type { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { assertEventName } from "#core/events/DomainEvent";

type HandlerClass = abstract new (...args: never[]) => AbstractEventHandler<never>;

// A WeakMap instead of decorator metadata: `Symbol.metadata` is not in Node 24 yet.
const eventNamesByClass = new WeakMap<object, readonly string[]>();

/**
 * Names the events a handler class reacts to: exact names or patterns with `*` for one segment
 * (`history.*.changed`). Only stores the names; the module creates the handler with its
 * dependencies and registers it at the event bus, so nothing is shared between apps (tests build
 * many).
 */
export function EventHandler(...eventNames: [string, ...string[]]) {
  for (const name of eventNames) {
    assertEventName(name, true);
  }

  return <T extends HandlerClass>(target: T, context: ClassDecoratorContext<T>): void => {
    if (context.kind !== "class") {
      throw new Error("@EventHandler decorates classes only");
    }

    eventNamesByClass.set(target, [...new Set(eventNames)]);
  };
}

/** The names of the handler's class; undefined when the class has no `@EventHandler`. */
export function eventNamesOf(handler: AbstractEventHandler<never>): readonly string[] | undefined {
  return eventNamesByClass.get(handler.constructor);
}
