import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { assetLinks, assetMedia, assets, campaignMemberships, campaigns, classes, features, mediaFiles, notes, rulesets, species, speciesVariants, tags, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";
import { loadRegisteredEntities } from "#test/helpers/registeredEntities";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  otherRuleset: "10000000-0000-4000-8000-000000002014",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  former: "a0000000-0000-4000-8000-000000000006",
  foreignGm: "a0000000-0000-4000-8000-000000000007",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  asset: "d0000000-0000-4000-8000-00000000000a",
  linkedAsset: "d0000000-0000-4000-8000-00000000000b",
  assetLink: "f0000000-0000-4000-8000-00000000000a",
  tag: "f0000000-0000-4000-8000-00000000000b",
  media: "f0000000-0000-4000-8000-00000000000c",
  assetMedia: "f0000000-0000-4000-8000-00000000000d",
  playerMembership: "e0000000-0000-4000-8000-00000000000a",
  noteAsset: "d0000000-0000-4000-8000-00000000000c",
  note: "f0000000-0000-4000-8000-00000000000e",
  featureAsset: "d0000000-0000-4000-8000-00000000000d",
  feature: "f0000000-0000-4000-8000-00000000000f",
  classAsset: "d0000000-0000-4000-8000-00000000000e",
  class: "f0000000-0000-4000-8000-000000000010",
  speciesAsset: "d0000000-0000-4000-8000-00000000000f",
  species: "f0000000-0000-4000-8000-000000000011",
  variantAsset: "d0000000-0000-4000-8000-000000000010",
  variant: "f0000000-0000-4000-8000-000000000012",
} as const;

type Role = "outsider" | "former" | "foreignGm" | "player" | "editor" | "gm" | "admin";

const ROLES: readonly Role[] = ["outsider", "former", "foreignGm", "player", "editor", "gm", "admin"];

const ACTORS: Record<Role, TestActor> = {
  outsider: { actorId: ID.outsider, systemRole: "USER" },
  former: { actorId: ID.former, systemRole: "USER" },
  foreignGm: { actorId: ID.foreignGm, systemRole: "USER" },
  player: { actorId: ID.player, systemRole: "USER" },
  editor: { actorId: ID.editor, systemRole: "USER" },
  gm: { actorId: ID.gm, systemRole: "USER" },
  admin: { actorId: ID.admin, systemRole: "ADMIN" },
};

/** The foreign GM claims the own campaign in the header while the path points elsewhere. */
const HEADERS: Partial<Record<Role, Record<string, string>>> = {
  foreignGm: { "x-campaign-id": ID.foreignCampaign },
};

const assetMediaUrl = `/api/v1/campaigns/${ID.campaign}/assets/${ID.asset}/media/${ID.assetMedia}`;
const tagUrl = `/api/v1/campaigns/${ID.campaign}/tags/${ID.tag}`;
const assetLinkUrl = `/api/v1/campaigns/${ID.campaign}/assets/${ID.asset}/links/${ID.assetLink}`;
const noteUrl = `/api/v1/campaigns/${ID.campaign}/notes/${ID.note}`;
const featureUrl = `/api/v1/campaigns/${ID.campaign}/features/${ID.feature}`;
const classUrl = `/api/v1/campaigns/${ID.campaign}/classes/${ID.class}`;
const speciesUrl = `/api/v1/campaigns/${ID.campaign}/species/${ID.species}`;
const variantUrl = `${speciesUrl}/variants/${ID.variant}`;

type Inject = ReturnType<typeof buildTestApp>["injectAs"];
type Response = Awaited<ReturnType<Inject>>;

type Fixture = {
  id: string;
  /** Roles that may read the history. Everyone else gets 404 for everything. */
  readers: readonly Role[];
  /** Answer to undoing a change, for those who may read. */
  revert: Partial<Record<Role, number>>;
  /** Answer to restoring a version, for those who may read. */
  restore: Partial<Record<Role, number>>;
  /** Roles that may change the row directly. */
  changers: readonly Role[];
  /** Writes one more change as somebody allowed to, so there is an entry to undo. */
  change(): Promise<void>;
  /** The direct change that everybody else must be refused. */
  attempt(role: Role): Promise<Response>;
};

describe("history rights of every tracked entity", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // A new app per test, because one test sends more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;

  const as = (role: Role, request: Parameters<Inject>[1]) =>
    session.injectAs(ACTORS[role], {
      ...request,
      headers: { ...request.headers, ...HEADERS[role] },
    });

  const rowVersion = async (table: typeof assetLinks | typeof assetMedia | typeof assets | typeof classes | typeof features | typeof species | typeof speciesVariants | typeof notes | typeof tags | typeof campaigns | typeof campaignMemberships | typeof rulesets | typeof users, id: string) => {
    const [row] = await db
      .select({ version: table.version })
      .from(table as typeof campaigns)
      .where(eq(table.id, id));

    return row!.version;
  };

  let counter = 0;
  const unique = () => {
    counter += 1;

    return `Name ${counter}`;
  };

  const patchAs = (role: Role, url: string, payload: Record<string, unknown>) =>
    as(role, { method: "PATCH", url, payload });

  const expectOk = (response: Response) => {
    expect(response.statusCode).toBeLessThan(300);
  };

  const FIXTURES: Record<string, Fixture> = {
    campaign: {
      id: ID.campaign,
      readers: ["gm", "admin"],
      revert: { gm: 200, admin: 200 },
      restore: { gm: 200, admin: 200 },
      changers: ["gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", `/api/v1/campaigns/${ID.campaign}`, {
            name: unique(),
            expectedVersion: await rowVersion(campaigns, ID.campaign),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, `/api/v1/campaigns/${ID.campaign}`, {
          name: "Taken over",
          expectedVersion: await rowVersion(campaigns, ID.campaign),
        }),
    },
    campaignMembership: {
      id: ID.playerMembership,
      // The player's own row: seeing it is not enough, players may not change it.
      readers: ["editor", "gm", "admin"],
      revert: { editor: 409, gm: 409, admin: 409 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        const url = `/api/v1/campaigns/${ID.campaign}/members/${ID.playerMembership}`;

        // There and back, so the player stays a player for the next checks.
        for (const role of ["EDITOR", "PLAYER"]) {
          expectOk(
            await patchAs("gm", url, {
              role,
              expectedVersion: await rowVersion(campaignMemberships, ID.playerMembership),
            }),
          );
        }
      },
      attempt: async (role) =>
        patchAs(role, `/api/v1/campaigns/${ID.campaign}/members/${ID.playerMembership}`, {
          role: "EDITOR",
          expectedVersion: await rowVersion(campaignMemberships, ID.playerMembership),
        }),
    },
    asset: {
      id: ID.asset,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 403, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        const [row] = await db.select().from(assets).where(eq(assets.id, ID.asset));

        const expectedVersion = row!.version;

        expectOk(
          row!.status === "ARCHIVED"
            ? await as("gm", {
                method: "POST",
                url: `/api/v1/assets/${ID.asset}/restore`,
                payload: { expectedVersion },
              })
            : await as("gm", {
                method: "DELETE",
                url: `/api/v1/assets/${ID.asset}?expectedVersion=${expectedVersion}`,
              }),
        );
      },
      attempt: async (role) => {
        const [row] = await db.select().from(assets).where(eq(assets.id, ID.asset));

        return as(role, {
          method: "DELETE",
          url: `/api/v1/assets/${ID.asset}?expectedVersion=${row!.version}`,
        });
      },
    },
    assetLink: {
      id: ID.assetLink,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", assetLinkUrl, {
            label: unique(),
            expectedVersion: await rowVersion(assetLinks, ID.assetLink),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, assetLinkUrl, {
          label: "Taken over",
          expectedVersion: await rowVersion(assetLinks, ID.assetLink),
        }),
    },
    assetMedia: {
      id: ID.assetMedia,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", assetMediaUrl, {
            title: unique(),
            expectedVersion: await rowVersion(assetMedia, ID.assetMedia),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, assetMediaUrl, {
          title: "Taken over",
          expectedVersion: await rowVersion(assetMedia, ID.assetMedia),
        }),
    },
    note: {
      id: ID.note,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", noteUrl, {
            content: unique(),
            expectedVersion: await rowVersion(notes, ID.note),
            expectedAssetVersion: await rowVersion(assets, ID.noteAsset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, noteUrl, {
          content: "Taken over",
          expectedVersion: await rowVersion(notes, ID.note),
          expectedAssetVersion: await rowVersion(assets, ID.noteAsset),
        }),
    },
    class: {
      id: ID.class,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", classUrl, {
            description: unique(),
            expectedVersion: await rowVersion(classes, ID.class),
            expectedAssetVersion: await rowVersion(assets, ID.classAsset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, classUrl, {
          description: "Taken over",
          expectedVersion: await rowVersion(classes, ID.class),
          expectedAssetVersion: await rowVersion(assets, ID.classAsset),
        }),
    },
    species: {
      id: ID.species,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", speciesUrl, {
            description: unique(),
            expectedVersion: await rowVersion(species, ID.species),
            expectedAssetVersion: await rowVersion(assets, ID.speciesAsset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, speciesUrl, {
          description: "Taken over",
          expectedVersion: await rowVersion(species, ID.species),
          expectedAssetVersion: await rowVersion(assets, ID.speciesAsset),
        }),
    },
    speciesVariant: {
      id: ID.variant,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", variantUrl, {
            description: unique(),
            expectedVersion: await rowVersion(speciesVariants, ID.variant),
            expectedAssetVersion: await rowVersion(assets, ID.variantAsset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, variantUrl, {
          description: "Taken over",
          expectedVersion: await rowVersion(speciesVariants, ID.variant),
          expectedAssetVersion: await rowVersion(assets, ID.variantAsset),
        }),
    },
    feature: {
      id: ID.feature,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", featureUrl, {
            description: unique(),
            expectedVersion: await rowVersion(features, ID.feature),
            expectedAssetVersion: await rowVersion(assets, ID.featureAsset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, featureUrl, {
          description: "Taken over",
          expectedVersion: await rowVersion(features, ID.feature),
          expectedAssetVersion: await rowVersion(assets, ID.featureAsset),
        }),
    },
    tag: {
      id: ID.tag,
      readers: ["editor", "gm", "admin"],
      revert: { editor: 200, gm: 200, admin: 200 },
      restore: { editor: 403, gm: 200, admin: 200 },
      changers: ["editor", "gm", "admin"],
      change: async () => {
        expectOk(
          await patchAs("gm", tagUrl, {
            name: unique(),
            expectedVersion: await rowVersion(tags, ID.tag),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, tagUrl, {
          name: "Taken over",
          expectedVersion: await rowVersion(tags, ID.tag),
        }),
    },
    ruleset: {
      id: ID.otherRuleset,
      readers: ["admin"],
      revert: { admin: 200 },
      restore: { admin: 200 },
      changers: ["admin"],
      change: async () => {
        expectOk(
          await patchAs("admin", `/api/v1/ruleset/${ID.otherRuleset}`, {
            name: unique(),
            expectedVersion: await rowVersion(rulesets, ID.otherRuleset),
          }),
        );
      },
      attempt: async (role) =>
        patchAs(role, `/api/v1/ruleset/${ID.otherRuleset}`, {
          name: "Taken over",
          expectedVersion: await rowVersion(rulesets, ID.otherRuleset),
        }),
    },
    user: {
      id: ID.player,
      // The player's own account: not readable, because the player may not manage it.
      readers: ["admin"],
      revert: { admin: 409 },
      restore: { admin: 200 },
      changers: ["admin"],
      change: async () => {
        for (const status of ["LOCKED", "ACTIVE"]) {
          expectOk(
            await patchAs("admin", `/api/v1/users/${ID.player}`, {
              status,
              expectedVersion: await rowVersion(users, ID.player),
            }),
          );
        }
      },
      attempt: async (role) =>
        patchAs(role, `/api/v1/users/${ID.player}`, {
          status: "LOCKED",
          expectedVersion: await rowVersion(users, ID.player),
        }),
    },
  };

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "RIGHTS_MAIN" },
        { id: ID.otherRuleset, code: "RIGHTS_OTHER" },
      ].map((ruleset) => ({
        ...ruleset,
        name: "Ruleset",
        description: null,
        status: "ACTIVE" as const,
        editionYear: 2024,
        sourceReference: {},
        licenseCode: "TEST",
        attribution: null,
      })),
    );
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.editor, ID.former, ID.foreignGm].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values(
      [
        { id: ID.campaign, ownerUserId: ID.gm, slug: "own" },
        { id: ID.foreignCampaign, ownerUserId: ID.foreignGm, slug: "foreign" },
      ].map((campaign) => ({
        ...campaign,
        rulesetId: ID.ruleset,
        name: "Campaign",
        status: "ACTIVE" as const,
        createdBy: campaign.ownerUserId,
      })),
    );
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      {
        id: ID.playerMembership,
        campaignId: ID.campaign,
        userId: ID.player,
        role: "PLAYER",
        createdBy: ID.gm,
      },
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      {
        campaignId: ID.campaign,
        userId: ID.former,
        role: "EDITOR",
        status: "REVOKED",
        revokedAt: new Date(),
        revokedBy: ID.gm,
        createdBy: ID.gm,
      },
      {
        campaignId: ID.foreignCampaign,
        userId: ID.foreignGm,
        role: "EDITOR",
        createdBy: ID.foreignGm,
      },
    ]);
    await db.insert(assets).values(
      [
        { id: ID.asset, title: "Ember", slug: "ember" },
        { id: ID.linkedAsset, title: "Spark", slug: "spark" },
      ].map((asset) => ({
        ...asset,
        scope: "CAMPAIGN" as const,
        origin: "CUSTOM" as const,
        campaignId: ID.campaign,
        assetType: "SPELL" as const,
        status: "ACTIVE" as const,
      })),
    );
    await db.insert(assets).values({
      id: ID.noteAsset,
      title: "Letter",
      slug: "letter",
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: ID.campaign,
      assetType: "NOTE",
      status: "ACTIVE",
    });
    await db.insert(notes).values({
      id: ID.note,
      campaignId: ID.campaign,
      assetId: ID.noteAsset,
      noteType: "LORE",
      content: "Start",
    });
    await db.insert(assets).values({
      id: ID.featureAsset,
      title: "Rage",
      slug: "rage",
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: ID.campaign,
      assetType: "FEATURE",
      status: "ACTIVE",
    });
    await db.insert(features).values({
      id: ID.feature,
      campaignId: ID.campaign,
      assetId: ID.featureAsset,
      code: "rage",
      featureType: "ACTIVE",
    });
    await db.insert(assets).values({
      id: ID.classAsset,
      title: "Barbarian",
      slug: "barbarian",
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: ID.campaign,
      assetType: "CLASS",
      status: "ACTIVE",
    });
    await db.insert(classes).values({
      id: ID.class,
      campaignId: ID.campaign,
      assetId: ID.classAsset,
      code: "barbarian",
      hitDie: "D12",
      firstLevelHitPoints: 12,
      fixedHitPointsPerLevel: 7,
      subclassSelectionLevel: 3,
      primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
      levels: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, featureGrants: [] })),
      choices: [
        {
          key: "subclass",
          level: 3,
          grantKey: null,
          choiceType: "SUBCLASS",
          minimumSelections: 1,
          maximumSelections: 1,
          replacementPolicy: "NONE",
          optionFilter: { assetTypes: ["SUBCLASS"] },
          displayOrder: 0,
          options: [],
        },
      ],
      multiclass: { combinationMode: "ALL", abilityRequirements: [] },
    });
    await db.insert(assets).values(
      [
        { id: ID.speciesAsset, title: "Elf", slug: "elf", assetType: "SPECIES" as const },
        { id: ID.variantAsset, title: "Drow", slug: "drow", assetType: "SPECIES_VARIANT" as const },
      ].map((asset) => ({
        ...asset,
        scope: "CAMPAIGN" as const,
        origin: "CUSTOM" as const,
        campaignId: ID.campaign,
        status: "ACTIVE" as const,
      })),
    );
    await db.insert(species).values({
      id: ID.species,
      campaignId: ID.campaign,
      assetId: ID.speciesAsset,
      code: "elf",
      creatureType: "HUMANOID",
      lifespanMode: "RULESET_DEFAULT",
      sizeOptions: [{ size: "MEDIUM", isDefault: true, displayOrder: 0 }],
      movementModes: [{ mode: "WALK", distanceFeet: 30, isBase: true }],
      variantGroups: [
        {
          code: "lineage",
          name: "Lineage",
          minimumSelections: 1,
          maximumSelections: 1,
          required: true,
          displayOrder: 0,
        },
      ],
    });
    await db.insert(speciesVariants).values({
      id: ID.variant,
      campaignId: ID.campaign,
      assetId: ID.variantAsset,
      speciesId: ID.species,
      variantGroupCode: "lineage",
      code: "drow",
    });
    await db.insert(mediaFiles).values({
      id: ID.media,
      campaignId: ID.campaign,
      scope: "CAMPAIGN",
      storageKey: `media/${ID.campaign}/${ID.media}.pdf`,
      originalName: "map.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      sha256: "a".repeat(64),
      status: "READY",
      uploadedBy: ID.gm,
    });
    await db.insert(assetMedia).values({
      id: ID.assetMedia,
      campaignId: ID.campaign,
      assetId: ID.asset,
      mediaId: ID.media,
      role: "DOCUMENT",
    });
    await db.insert(tags).values({
      id: ID.tag,
      campaignId: ID.campaign,
      name: "Start",
      normalizedName: "start",
    });
    await db.insert(assetLinks).values({
      id: ID.assetLink,
      campaignId: ID.campaign,
      sourceAssetId: ID.asset,
      targetAssetId: ID.linkedAsset,
      relationType: "RELATED_TO",
    });
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("has a fixture for every registered entity", async () => {
    const registered = (await loadRegisteredEntities()).map((entity) => entity.type).sort();

    expect(Object.keys(FIXTURES).sort()).toEqual(registered);
  });

  describe.each(Object.entries(FIXTURES))("%s", (type, fixture) => {
    const historyUrl = `/api/v1/history/${type}/${fixture.id}`;

    const adminEntries = async () => {
      const response = await as("admin", { method: "GET", url: historyUrl });

      expect(response.statusCode).toBe(200);

      return response.json().data as { eventId: string }[];
    };

    it("answers read, version, undo and restore per role", async () => {
      for (const role of ROLES) {
        await fixture.change();

        const reader = fixture.readers.includes(role);
        const list = await as(role, { method: "GET", url: historyUrl });
        const version = await as(role, { method: "GET", url: `${historyUrl}/versions/1` });
        const [latest] = await adminEntries();
        const undo = await as(role, {
          method: "POST",
          url: `/api/v1/history/events/${latest!.eventId}/revert`,
          payload: {},
        });
        const restore = await as(role, {
          method: "POST",
          url: `${historyUrl}/versions/1/restore`,
          payload: {},
        });

        expect({
          role,
          list: list.statusCode,
          version: version.statusCode,
          undo: undo.statusCode,
          restore: restore.statusCode,
        }).toEqual({
          role,
          list: reader ? 200 : 404,
          version: reader ? 200 : 404,
          undo: reader ? fixture.revert[role] : 404,
          restore: reader ? fixture.restore[role] : 404,
        });
      }
    }, 30_000);

    it("refuses a direct change without a new entry for everyone else", async () => {
      await fixture.change();

      for (const role of ROLES.filter((item) => !fixture.changers.includes(item))) {
        const before = await adminEntries();
        const response = await fixture.attempt(role);

        expect({ role, refused: [403, 404].includes(response.statusCode) }).toEqual({
          role,
          refused: true,
        });
        expect(await adminEntries()).toEqual(before);
      }
    }, 30_000);
  });
});
