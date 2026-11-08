import { and, isNull } from "drizzle-orm";

import type { ContentReadPurpose } from "#core/content/access";
import { type ContentViewer, contentViewOf } from "#core/content/viewer";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { assetRulesets, assets, campaigns, rulesets, users } from "#core/db/schema";
import { AssetsRepository } from "#src/modules/assets/domain/repository/AssetsRepository";
import { ContentAccess } from "#src/modules/assets/index";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const OWNER = "a2000000-0000-4000-8000-000000000001";
const PLAYER = "a2000000-0000-4000-8000-000000000002";
const RULESET = "12000000-0000-4000-8000-000000002024";
const OTHER_RULESET = "12000000-0000-4000-8000-000000002014";
const CAMPAIGN = "c2000000-0000-4000-8000-00000000000a";
const FOREIGN_CAMPAIGN = "c2000000-0000-4000-8000-00000000000b";

type Fixture = {
  scope: "CAMPAIGN" | "SYSTEM";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  campaignId?: string;
  rulesetId?: string;
};

/** Every kind of asset the decision distinguishes. */
const FIXTURES = {
  ownDraft: { scope: "CAMPAIGN", status: "DRAFT" },
  ownActive: { scope: "CAMPAIGN", status: "ACTIVE" },
  ownActiveShared: { scope: "CAMPAIGN", status: "ACTIVE" },
  ownArchived: { scope: "CAMPAIGN", status: "ARCHIVED" },
  ownArchivedInUse: { scope: "CAMPAIGN", status: "ARCHIVED" },
  foreignActive: { scope: "CAMPAIGN", status: "ACTIVE", campaignId: FOREIGN_CAMPAIGN },
  globalDraft: { scope: "SYSTEM", status: "DRAFT" },
  globalActive: { scope: "SYSTEM", status: "ACTIVE" },
  globalActiveOfRuleset: { scope: "SYSTEM", status: "ACTIVE", rulesetId: RULESET },
  globalActiveOtherRuleset: { scope: "SYSTEM", status: "ACTIVE", rulesetId: OTHER_RULESET },
  globalArchived: { scope: "SYSTEM", status: "ARCHIVED" },
  globalArchivedInUse: { scope: "SYSTEM", status: "ARCHIVED" },
  globalArchivedInUseOtherRuleset: {
    scope: "SYSTEM",
    status: "ARCHIVED",
    rulesetId: OTHER_RULESET,
  },
} satisfies Record<string, Fixture>;

type Name = keyof typeof FIXTURES;

const ID = Object.fromEntries(
  Object.keys(FIXTURES).map((name, index) => [
    name,
    `e2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
) as Record<Name, string>;

const SHARED: Name[] = ["ownActiveShared", "ownDraft", "foreignActive"];
const IN_USE: Name[] = ["ownArchivedInUse", "globalArchivedInUse", "globalArchivedInUseOtherRuleset"];

const OWN: Name[] = ["ownDraft", "ownActive", "ownActiveShared", "ownArchived", "ownArchivedInUse"];
const OFFERED_GLOBAL: Name[] = [
  "globalActive",
  "globalActiveOfRuleset",
  "globalArchived",
  "globalArchivedInUse",
];
const CATALOG: Name[] = [
  "ownDraft",
  "ownActive",
  "ownActiveShared",
  "ownArchivedInUse",
  "globalActive",
  "globalActiveOfRuleset",
  "globalArchivedInUse",
];
const PLAYER_SEES: Name[] = [
  "ownActiveShared",
  "ownArchivedInUse",
  "globalActive",
  "globalActiveOfRuleset",
  "globalArchivedInUse",
];
const ALL_GLOBAL = (Object.keys(FIXTURES) as Name[]).filter(
  (name) => FIXTURES[name].scope === "SYSTEM",
);

const viewer = (
  campaignRole: ContentViewer["campaignRole"],
  isAdmin = false,
  actorId = OWNER,
): ContentViewer => ({
  actorId,
  isAdmin,
  campaignId: CAMPAIGN,
  rulesetId: RULESET,
  campaignRole,
  view: contentViewOf({ isAdmin, campaignRole }),
});

const MATRIX: [string, ContentViewer, Record<ContentReadPurpose, Name[]>][] = [
  ["owner", viewer("OWNER"), { READ: [...OWN, ...OFFERED_GLOBAL], CATALOG, MANAGE: OWN }],
  ["editor", viewer("EDITOR"), { READ: [...OWN, ...OFFERED_GLOBAL], CATALOG, MANAGE: OWN }],
  ["administrator", viewer(null, true), { READ: [...OWN, ...ALL_GLOBAL], CATALOG, MANAGE: OWN }],
  [
    "player",
    viewer("PLAYER", false, PLAYER),
    { READ: PLAYER_SEES, CATALOG: PLAYER_SEES, MANAGE: [] },
  ],
];

describe("content access", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const repository = new AssetsRepository();

  const accessFor = (who: ContentViewer) =>
    new ContentAccess(
      who,
      new Set(SHARED.map((name) => ID[name])),
      new Set(IN_USE.map((name) => ID[name])),
      { db, repository },
    );
  const names = (ids: Iterable<string>) =>
    [...ids]
      .map((id) => (Object.keys(ID) as Name[]).find((name) => ID[name] === id))
      .sort();

  beforeEach(async () => {
    await db.insert(rulesets).values(
      [RULESET, OTHER_RULESET].map((id, index) => ({
        id,
        code: `CONTENT_ACCESS_${index}`,
        name: `Ruleset ${index}`,
        status: "ACTIVE" as const,
        editionYear: index === 0 ? 2024 : 2014,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );
    await db.insert(users).values(
      [OWNER, PLAYER].map((id, index) => ({
        id,
        email: `content-access-${index}@example.test`,
        passwordHash: "hash",
        displayName: `User ${index}`,
        systemRole: "USER" as const,
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values(
      [CAMPAIGN, FOREIGN_CAMPAIGN].map((id, index) => ({
        id,
        ownerUserId: OWNER,
        rulesetId: RULESET,
        name: `Campaign ${index}`,
        slug: `content-access-${index}`,
        status: "ACTIVE" as const,
        createdBy: OWNER,
      })),
    );
    await db.insert(assets).values(
      (Object.entries(FIXTURES) as [Name, Fixture][]).map(([name, fixture]) => ({
        id: ID[name],
        assetType: "NOTE" as const,
        title: name,
        slug: name.toLowerCase(),
        status: fixture.status,
        scope: fixture.scope,
        origin: fixture.scope === "SYSTEM" ? ("DEFAULT" as const) : ("CUSTOM" as const),
        campaignId: fixture.scope === "SYSTEM" ? null : ("campaignId" in fixture ? fixture.campaignId : CAMPAIGN),
        rulesetPolicy: "rulesetId" in fixture ? ("RESTRICTED" as const) : ("NEUTRAL" as const),
      })),
    );
    await db.insert(assetRulesets).values(
      (Object.entries(FIXTURES) as [Name, Fixture][]).flatMap(([name, fixture]) =>
        "rulesetId" in fixture ? [{ assetId: ID[name], rulesetId: fixture.rulesetId }] : [],
      ),
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe.each(MATRIX)("for the %s", (_label, who, expected) => {
    it.each(["READ", "CATALOG", "MANAGE"] as const)(
      "lets %s reach exactly the expected assets, in code and in SQL alike",
      async (purpose) => {
        const access = accessFor(who);
        const rows = await db.select().from(assets);
        const decided = await access.readableIds(purpose, rows);
        const queried = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(isNull(assets.deletedAt), access.where(purpose)));

        expect(names(decided)).toEqual([...expected[purpose]].sort());
        expect(names(queried.map((row) => row.id))).toEqual([...expected[purpose]].sort());
      },
    );
  });

  it("reports what the viewer may not read as missing", async () => {
    const access = accessFor(viewer("PLAYER", false, PLAYER));
    const [hidden] = await db.select().from(assets).where(isNull(assets.campaignId)).limit(1);

    await expect(access.require("READ", undefined)).rejects.toThrow("Asset not found");
    await expect(
      access.require("MANAGE", hidden, "Feature not found"),
    ).rejects.toThrow("Feature not found");
  });
});
