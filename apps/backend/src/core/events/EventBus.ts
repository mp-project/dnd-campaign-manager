import type { FastifyBaseLogger } from "fastify";

import type { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import type { DomainEvent } from "#core/events/DomainEvent";
import { eventNamesOf } from "#core/events/EventHandler";
import type { ErrorReporter } from "#core/log/errorReporter";
import { reportError, reportErrorInContext } from "#core/log/reportError";

/** Port of the event bus, available as `container.ports.eventBus`. */
export interface EventBus {
  /** Reads the names from `@EventHandler`; throws for a handler without one. */
  register(handler: AbstractEventHandler<never>): void;
  /**
   * After the commit only. Runs the matching handlers one after another, in the order they were
   * registered. Best effort: a failing handler is reported, the others still run, and nothing is
   * undone.
   */
  publish(events: readonly DomainEvent[]): Promise<void>;
}

type Registration = {
  handler: AbstractEventHandler<never>;
  patterns: readonly (readonly string[])[];
};

function matches(pattern: readonly string[], name: readonly string[]): boolean {
  return (
    pattern.length === name.length &&
    pattern.every((segment, index) => segment === "*" || segment === name[index])
  );
}

export class InProcessEventBus implements EventBus {
  private readonly registrations: Registration[] = [];

  /** Without a logger, errors go to the log of the current request or process. */
  constructor(
    private readonly logger?: FastifyBaseLogger,
    private readonly reporter?: ErrorReporter,
  ) {}

  register(handler: AbstractEventHandler<never>): void {
    const names = eventNamesOf(handler);

    if (!names) {
      throw new Error(`Event handler '${handler.constructor.name}' has no @EventHandler`);
    }

    if (this.registrations.some((registration) => registration.handler === handler)) {
      throw new Error(`Event handler '${handler.constructor.name}' is already registered`);
    }

    this.registrations.push({ handler, patterns: names.map((name) => name.split(".")) });
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      const name = event.name.split(".");

      for (const { handler, patterns } of this.registrations) {
        if (!patterns.some((pattern) => matches(pattern, name))) {
          continue;
        }

        try {
          await (handler as AbstractEventHandler).handle(event);
        } catch (error) {
          // A handler only follows up on a committed change; the others still run.
          this.report(error, {
            task: "events.handler",
            eventName: event.name,
            eventId: event.id,
            handler: handler.constructor.name,
          });
        }
      }
    }
  }

  private report(error: unknown, context: Record<string, string>): void {
    if (this.logger) {
      reportError(this.logger, error, "Event handler failed", context, this.reporter);
    } else {
      reportErrorInContext(error, "Event handler failed", context);
    }
  }
}
