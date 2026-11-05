import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import * as schema from "#core/db/schema";
import type { TrackedEntity } from "#core/history/types";
import { loadRegisteredEntities } from "#test/helpers/registeredEntities";

/** Tables that are not tracked, each with the reason. A new table must be added here or tracked. */
const UNTRACKED_TABLES: Record<string, string> = {
  // The history itself.
  entity_change_events: "Stores the history",
  entity_change_fields: "Stores the history",
  entity_history_horizons: "Stores the history",
  history_idempotency_keys: "Technical state of the history",
  // Technical state without content.
  auth_attempts: "Technical counters",
  refresh_tokens: "Technical session state",
  trusted_devices: "Technical session state",
  password_reset_tokens: "Short-lived tokens",
  email_verification_requests: "Short-lived codes",
  campaign_runtime_state: "Technical runtime state, unused so far",
  system_runtime_state: "Technical runtime state",
  // Decided against: nothing worth restoring, and the row records its own course.
  media_files: "Nobody can edit a file; the status only records the course of the upload",
  media_uploads: "A running upload; nothing to restore",
  media_variants: "Generated from the file and can be generated again",
  campaign_invitations: "Nothing to restore; an expired invitation is sent again",
  // Part of another entity or fixed after creation.
  asset_rulesets: "Tracked as the list field `rulesetIds` of an asset",
  asset_tags: "Tracked as the list field `tagIds` of an asset",
  asset_families: "Read-only reference data",
  ruleset_level_progressions: "Only written together with a new ruleset, never changed",
  ruleset_spell_slot_progressions: "Only written together with a new ruleset, never changed",
  // Personal preferences; nobody else changes them.
  user_settings: "Personal preferences of the own account",
};

const allTables = Object.entries(schema).flatMap(([exportName, value]) =>
  is(value, PgTable) ? [{ exportName, tableName: getTableName(value) }] : [],
);

describe("history coverage", () => {
  let entities: readonly TrackedEntity[];
  let trackedTableNames: string[];

  beforeAll(async () => {
    entities = await loadRegisteredEntities();
    trackedTableNames = entities.map((entity) => getTableName(entity.table));
  });

  it("knows every table as tracked or as an exception with a reason", () => {
    const unknown = allTables
      .map((table) => table.tableName)
      .filter((name) => !trackedTableNames.includes(name) && !UNTRACKED_TABLES[name]);

    expect(unknown).toEqual([]);
  });

  it("has no exception for a tracked or removed table", () => {
    const tableNames: string[] = allTables.map((table) => table.tableName);
    const stale = Object.keys(UNTRACKED_TABLES).filter(
      (name) => trackedTableNames.includes(name) || !tableNames.includes(name),
    );

    expect(stale).toEqual([]);
  });

  it("forbids direct writes to every tracked table in the ESLint rule", () => {
    const config = readFileSync(resolve(process.cwd(), "../../eslint.config.js"), "utf8");
    const listed = config.match(/const TRACKED_TABLES = \[([^\]]*)\]/)?.[1] ?? "";
    const expected = allTables
      .filter((table) => trackedTableNames.includes(table.tableName))
      .map((table) => table.exportName)
      .sort();

    expect([...listed.matchAll(/"(\w+)"/g)].map((match) => match[1]).sort()).toEqual(expected);
  });

  it("never allows undoing fields that grant rights", () => {
    const rightsFields = { user: ["systemRole", "status"], campaignMembership: ["role", "status"] };

    for (const [type, fields] of Object.entries(rightsFields)) {
      const entity = entities.find((item) => item.type === type) as TrackedEntity;

      for (const field of fields) {
        expect(entity.fields[field as keyof typeof entity.fields]).toMatchObject({
          kind: "value",
          revertible: false,
        });
      }
    }
  });

  it("never stores a value of secrets and account data", () => {
    const user = entities.find((item) => item.type === "user") as TrackedEntity;
    const kindOf = (field: string) =>
      (user.fields as Record<string, { kind: string }>)[field]?.kind;

    expect(kindOf("passwordHash")).toBe("secret");
    expect(kindOf("email")).toBe("account");
    expect(kindOf("displayName")).toBe("account");
    expect(kindOf("username")).toBe("account");
  });

  it("denies everyone by default: every entity defines who may read", () => {
    for (const entity of entities) {
      expect(typeof entity.access.read).toBe("function");
    }
  });
});
