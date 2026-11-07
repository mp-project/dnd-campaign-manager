import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionScope } from "#core/history/types";
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "#core/error/http/index";
import type {
  AssetRow,
  AssetsRepository,
} from "#src/modules/assets/domain/repository/AssetsRepository";
import {
  type AssetCampaignAccessPort,
  AssetsService,
} from "#src/modules/assets/service/AssetsService";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CAMPAIGN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RULESET_ID = "11111111-1111-4111-8111-111111111111";
const FAMILY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const db = {} as AppDatabase;
const transactionManager = {} as TransactionManager;

function createAssetRow(overrides: Partial<AssetRow> = {}): AssetRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: ACTOR_ID,
    updatedBy: ACTOR_ID,
    assetType: "NOTE",
    title: "Asset",
    slug: "asset",
    summary: null,
    status: "DRAFT",
    scope: "CAMPAIGN",
    origin: "CUSTOM",
    campaignId: CAMPAIGN_ID,
    assetFamilyId: null,
    rulesetPolicy: "NEUTRAL",
    sourceReference: null,
    releasedToPlayers: false,
    ...overrides,
  };
}

function createFakeRepository() {
  const repository = {
    findFamilyById: jest.fn(async () => ({ id: FAMILY_ID, assetType: "SPELL" })),
  };

  return {
    repository: repository as unknown as AssetsRepository,
    mocks: repository,
  };
}

/** Action scope that records created values instead of writing them. */
function createFakeScope() {
  const created: Record<string, unknown>[] = [];
  const scope = {
    actionId: "action",
    tx: db,
    create: jest.fn(async (_entity: unknown, values: Record<string, unknown>) => {
      created.push(values);

      return createAssetRow(values as Partial<AssetRow>);
    }),
  } as unknown as ActionScope;

  return { scope, created };
}

function createCampaignAccess(
  role: "EDITOR" | "PLAYER" | null,
): AssetCampaignAccessPort {
  return {
    findCampaignRole: async (campaignId) =>
      campaignId === CAMPAIGN_ID
        ? { campaignId, rulesetId: RULESET_ID, role, isOwner: false }
        : null,
  };
}

describe("AssetsService", () => {
  describe("createBase", () => {
    it("derives campaign scope, origin and campaign ruleset for restricted homebrew", async () => {
      const fake = createFakeRepository();
      const { scope, created } = createFakeScope();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      const result = await service.createBase(
        scope,
        { actorId: ACTOR_ID, campaignId: CAMPAIGN_ID },
        { assetType: "SPELL", title: "Ember Lance!", rulesetPolicy: "RESTRICTED" },
      );

      expect(created[0]).toMatchObject({
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        campaignId: CAMPAIGN_ID,
        slug: "ember-lance",
      });
      expect(result.rulesetIds).toEqual([RULESET_ID]);
    });

    it("creates system defaults with explicit rulesets", async () => {
      const fake = createFakeRepository();
      const { scope, created } = createFakeScope();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess(null));

      await service.createBase(
        scope,
        { actorId: ACTOR_ID, campaignId: null },
        {
          assetType: "SPELL",
          title: "Fireball",
          rulesetPolicy: "RESTRICTED",
          rulesetIds: [RULESET_ID, RULESET_ID],
        },
      );

      expect(created[0]).toMatchObject({ scope: "SYSTEM", origin: "DEFAULT", campaignId: null });
      expect(created[0]?.rulesetIds).toEqual([RULESET_ID]);
    });

    it("rejects free ruleset ids on campaign assets", async () => {
      const fake = createFakeRepository();
      const { scope, created } = createFakeScope();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      await expect(
        service.createBase(
          scope,
          { actorId: ACTOR_ID, campaignId: CAMPAIGN_ID },
          { assetType: "SPELL", title: "X", rulesetPolicy: "RESTRICTED", rulesetIds: [RULESET_ID] },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(created).toHaveLength(0);
    });

    it("rejects neutral assets with rulesets and restricted system assets without rulesets", async () => {
      const fake = createFakeRepository();
      const { scope } = createFakeScope();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess(null));

      await expect(
        service.createBase(
          scope,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "SPELL", title: "X", rulesetIds: [RULESET_ID] },
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        service.createBase(
          scope,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "SPELL", title: "X", rulesetPolicy: "RESTRICTED" },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects families of another asset type and unknown campaigns", async () => {
      const fake = createFakeRepository();
      const { scope } = createFakeScope();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      await expect(
        service.createBase(
          scope,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "ITEM", title: "Rope", assetFamilyId: FAMILY_ID },
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      await expect(
        service.createBase(
          scope,
          { actorId: ACTOR_ID, campaignId: OTHER_CAMPAIGN_ID },
          { assetType: "NOTE", title: "Note" },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("resolveCampaignViewer", () => {
    it.each([
      ["EDITOR", "USER", "GM"],
      ["PLAYER", "USER", "PLAYER"],
      [null, "ADMIN", "GM"],
    ] as const)("maps campaign role %s with system role %s to %s view", async (role, systemRole, view) => {
      const service = new AssetsService(db, transactionManager, createFakeRepository().repository, createCampaignAccess(role));

      await expect(
        service.resolveCampaignViewer({ actorId: ACTOR_ID, systemRole }, CAMPAIGN_ID),
      ).resolves.toMatchObject({ view, rulesetId: RULESET_ID });
    });

    it("hides campaigns from non-members and requires authentication", async () => {
      const service = new AssetsService(db, transactionManager, createFakeRepository().repository, createCampaignAccess(null));

      await expect(
        service.resolveCampaignViewer({ actorId: ACTOR_ID, systemRole: "USER" }, CAMPAIGN_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        service.resolveCampaignViewer({ actorId: null, systemRole: "USER" }, CAMPAIGN_ID),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });
  });

  it("rejects assets of another campaign but accepts system assets", () => {
    const service = new AssetsService(db, transactionManager, createFakeRepository().repository, createCampaignAccess(null));

    expect(() => service.assertSameCampaign(createAssetRow(), OTHER_CAMPAIGN_ID)).toThrow(NotFoundError);
    expect(() =>
      service.assertSameCampaign(
        createAssetRow({ scope: "SYSTEM", origin: "DEFAULT", campaignId: null }),
        OTHER_CAMPAIGN_ID,
      ),
    ).not.toThrow();
  });

  it("merges visibility providers and rejects duplicate provider names", async () => {
    const service = new AssetsService(db, transactionManager, createFakeRepository().repository, createCampaignAccess("PLAYER"));
    const viewer = { actorId: ACTOR_ID, campaignId: CAMPAIGN_ID, rulesetId: RULESET_ID, view: "PLAYER" as const };

    expect(await service.listVisibleAssetIds(viewer)).toEqual([]);

    service.registerVisibilityProvider({ name: "shares", listVisibleAssetIds: async () => ["a", "b"] });
    service.registerVisibilityProvider({ name: "own", listVisibleAssetIds: async () => ["b", "c"] });

    expect((await service.listVisibleAssetIds(viewer)).sort()).toEqual(["a", "b", "c"]);
    expect(() =>
      service.registerVisibilityProvider({ name: "shares", listVisibleAssetIds: async () => [] }),
    ).toThrow("already registered");
  });
});

describe("releasing assets to players", () => {
  const service = () =>
    new AssetsService(db, transactionManager, {} as AssetsRepository, {
      findCampaignRole: async () => null,
    } as AssetCampaignAccessPort);

  it("only knows types that a module registered", () => {
    const assets = service();

    expect(assets.isReleasable("FEATURE")).toBe(false);

    assets.registerReleasableType("FEATURE");

    expect(assets.isReleasable("FEATURE")).toBe(true);
    expect(() => assets.registerReleasableType("FEATURE")).toThrow("already releasable");
  });

  it("refuses releases of global content and of types nobody registered", () => {
    const assets = service();

    assets.registerReleasableType("FEATURE");

    const validate = assets.trackedAsset.validate!;
    const current = { ...createAssetRow({ assetType: "FEATURE" }), rulesetIds: [] };

    expect(() => validate({ ...current, releasedToPlayers: true }, current)).not.toThrow();
    expect(() =>
      validate({ ...current, assetType: "NOTE", releasedToPlayers: true }, { ...current, assetType: "NOTE" }),
    ).toThrow("cannot be released");
    expect(() =>
      validate(
        { ...current, scope: "SYSTEM", releasedToPlayers: true },
        { ...current, scope: "SYSTEM" },
      ),
    ).toThrow("needs no release");
  });
});
