import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { baseColumns } from "#core/db/schemaHelpers";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { DEFAULT_HISTORY_LIMIT, HISTORY_LIMITS, type TrackedEntity } from "#core/history/types";
import { HistoryRepository } from "#src/modules/history/domain/repository/HistoryRepository";
import { HistoryService } from "#src/modules/history/service/HistoryService";

const table = pgTable("history_config_items", {
  ...baseColumns(),
  name: text("name").notNull(),
  hp: integer("hp").notNull(),
});

const access = { read: () => true };

function buildEntity(type = "item") {
  return defineTrackedEntity({
    type,
    table,
    access,
    fields: { name: field.value(), hp: field.counter() },
  });
}

function buildService() {
  const logger = { error: jest.fn() };

  return {
    logger,
    service: new HistoryService(
      {} as AppDatabase,
      {} as TransactionManager,
      new HistoryRepository(),
      logger,
    ),
  };
}

describe("history configuration", () => {
  it("defines the agreed levels and the default", () => {
    expect(HISTORY_LIMITS).toEqual({ minimal: 5, low: 20, standard: 50, high: 200 });
    expect(DEFAULT_HISTORY_LIMIT).toBe("standard");
  });

  it("rejects a list named like a column", () => {
    const clashing = {
      ...buildEntity(),
      lists: {
        name: field.list({ load: async () => [], save: async () => undefined }),
      },
    } as unknown as TrackedEntity;

    expect(() => buildService().service.register(clashing)).toThrow(/lists named like columns \[name\]/);
  });

  it("registers a complete entity", () => {
    expect(() => buildService().service.register(buildEntity())).not.toThrow();
  });

  it("rejects registering a type twice", () => {
    const { service } = buildService();

    service.register(buildEntity());

    expect(() => service.register(buildEntity())).toThrow(/already registered/);
  });

  it("rejects a column without a decision", () => {
    const incomplete = {
      type: "item",
      table,
      access,
      fields: { name: field.value() },
    } as unknown as TrackedEntity<typeof table>;

    expect(() => buildService().service.register(incomplete)).toThrow(/unclassified columns \[hp\]/);
  });

  it("rejects a field that is not a column", () => {
    const unknown = {
      type: "item",
      table,
      access,
      fields: { name: field.value(), hp: field.counter(), ghost: field.value() },
    } as unknown as TrackedEntity<typeof table>;

    expect(() => buildService().service.register(unknown)).toThrow(/unknown fields \[ghost\]/);
  });

  it("does not let a failing event handler undo a change", async () => {
    const { service, logger } = buildService();
    const after = jest.fn();

    service.subscribe("*", () => {
      throw new Error("handler failed");
    });
    service.subscribe("item.update", after);

    await service.publish([
      {
        eventId: "e",
        actionId: "a",
        action: "item.update",
        entityType: "item",
        entityId: "i",
        entityVersion: 2,
        campaignId: null,
        actorId: null,
        fields: ["name"],
      },
    ]);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
