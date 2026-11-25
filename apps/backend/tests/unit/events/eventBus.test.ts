import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import type { DomainEvent } from "#core/events/DomainEvent";
import { EventHandler, eventNamesOf } from "#core/events/EventHandler";
import { InProcessEventBus } from "#core/events/EventBus";
import { captureLogs } from "#test/helpers/logCapture";

function event(name: string, id = name): DomainEvent {
  return { id, name, occurredAt: new Date(), campaignId: null, actorId: null, payload: {} };
}

/** Records what it handles; one class per set of names, because names belong to the class. */
function recorder() {
  const seen: string[] = [];

  @EventHandler("items.instance.transferred", "history.*.changed")
  class Recorder extends AbstractEventHandler {
    async handle(handled: DomainEvent) {
      seen.push(handled.name);
    }
  }

  return { seen, handler: new Recorder() };
}

describe("@EventHandler", () => {
  it("stores the names on the class, without duplicates", () => {
    @EventHandler("notes.note.created", "notes.note.created", "notes.*.archived")
    class Probe extends AbstractEventHandler {
      async handle() {}
    }

    expect(eventNamesOf(new Probe())).toEqual(["notes.note.created", "notes.*.archived"]);
  });

  it("refuses invalid names when the class is declared", () => {
    expect(() => EventHandler("created")).toThrow(/Invalid event name 'created'/);
    expect(() => EventHandler("Notes.note.created")).toThrow(/Invalid event name/);
    expect(() => EventHandler("notes..created")).toThrow(/Invalid event name/);
  });
});

describe("InProcessEventBus", () => {
  it("refuses a handler without @EventHandler", () => {
    class Undecorated extends AbstractEventHandler {
      async handle() {}
    }

    expect(() => new InProcessEventBus().register(new Undecorated())).toThrow(
      /'Undecorated' has no @EventHandler/,
    );
  });

  it("refuses the same handler twice", () => {
    const bus = new InProcessEventBus();
    const { handler } = recorder();

    bus.register(handler);

    expect(() => bus.register(handler)).toThrow(/already registered/);
  });

  it("delivers exact names and one-segment wildcards only", async () => {
    const bus = new InProcessEventBus();
    const { seen, handler } = recorder();

    bus.register(handler);
    await bus.publish([
      event("items.instance.transferred"),
      event("items.instance.split"),
      event("history.note.changed"),
      event("history.note.sub.changed"),
      event("history.changed"),
    ]);

    expect(seen).toEqual(["items.instance.transferred", "history.note.changed"]);
  });

  it("reports a failing handler and still runs the others", async () => {
    const logs = captureLogs();
    const bus = new InProcessEventBus(logs.logger);
    const { seen, handler } = recorder();

    @EventHandler("history.*.changed")
    class Failing extends AbstractEventHandler {
      async handle(): Promise<void> {
        throw new Error("handler failed");
      }
    }

    bus.register(new Failing());
    bus.register(handler);

    await expect(bus.publish([event("history.note.changed", "e1")])).resolves.toBeUndefined();

    expect(seen).toEqual(["history.note.changed"]);
    expect(logs.find("Event handler failed")).toEqual([
      expect.objectContaining({
        task: "events.handler",
        eventName: "history.note.changed",
        eventId: "e1",
        handler: "Failing",
      }),
    ]);
  });
});
