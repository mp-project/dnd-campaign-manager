import type { AppDatabase, TransactionManager } from "#core/db/pool";
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "#core/error/http/index";
import type {
  AssetRow,
  AssetsRepository,
  CreateAssetInput,
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
    ...overrides,
  };
}

function createFakeRepository() {
  const created: CreateAssetInput[] = [];
  const synced: string[][] = [];

  const repository = {
    create: jest.fn(async (_db: AppDatabase, params: { values: CreateAssetInput }) => {
      created.push(params.values);

      return createAssetRow({
        ...params.values,
        summary: params.values.summary ?? null,
        status: params.values.status ?? "DRAFT",
        campaignId: params.values.campaignId ?? null,
        assetFamilyId: params.values.assetFamilyId ?? null,
        rulesetPolicy: params.values.rulesetPolicy ?? "NEUTRAL",
        sourceReference: params.values.sourceReference ?? null,
      });
    }),
    updateRulesets: jest.fn(async (_db: AppDatabase, params: { rulesetIds: readonly string[] }) => {
      synced.push([...params.rulesetIds]);
    }),
    countActiveRulesets: jest.fn(async () => synced.at(-1)?.length ?? 0),
    findFamilyById: jest.fn(async () => ({ id: FAMILY_ID, assetType: "SPELL" })),
  };

  return {
    repository: repository as unknown as AssetsRepository,
    mocks: repository,
    created,
    synced,
  };
}

function createCampaignAccess(
  role: "EDITOR" | "PLAYER" | null,
): AssetCampaignAccessPort {
  return {
    findCampaignRole: async (campaignId) =>
      campaignId === CAMPAIGN_ID ? { campaignId, rulesetId: RULESET_ID, role } : null,
  };
}

describe("AssetsService", () => {
  describe("createBase", () => {
    it("derives campaign scope, origin and campaign ruleset for restricted homebrew", async () => {
      const fake = createFakeRepository();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      const result = await service.createBase(
        db,
        { actorId: ACTOR_ID, campaignId: CAMPAIGN_ID },
        { assetType: "SPELL", title: "Ember Lance!", rulesetPolicy: "RESTRICTED" },
      );

      expect(fake.created[0]).toMatchObject({
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        campaignId: CAMPAIGN_ID,
        slug: "ember-lance",
      });
      expect(result.rulesetIds).toEqual([RULESET_ID]);
    });

    it("creates system defaults with explicit rulesets", async () => {
      const fake = createFakeRepository();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess(null));

      await service.createBase(
        db,
        { actorId: ACTOR_ID, campaignId: null },
        {
          assetType: "SPELL",
          title: "Fireball",
          rulesetPolicy: "RESTRICTED",
          rulesetIds: [RULESET_ID, RULESET_ID],
        },
      );

      expect(fake.created[0]).toMatchObject({ scope: "SYSTEM", origin: "DEFAULT", campaignId: null });
      expect(fake.synced[0]).toEqual([RULESET_ID]);
    });

    it("rejects free ruleset ids on campaign assets", async () => {
      const fake = createFakeRepository();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      await expect(
        service.createBase(
          db,
          { actorId: ACTOR_ID, campaignId: CAMPAIGN_ID },
          { assetType: "SPELL", title: "X", rulesetPolicy: "RESTRICTED", rulesetIds: [RULESET_ID] },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(fake.created).toHaveLength(0);
    });

    it("rejects neutral assets with rulesets and restricted system assets without rulesets", async () => {
      const fake = createFakeRepository();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess(null));

      await expect(
        service.createBase(
          db,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "SPELL", title: "X", rulesetIds: [RULESET_ID] },
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        service.createBase(
          db,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "SPELL", title: "X", rulesetPolicy: "RESTRICTED" },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects families of another asset type and unknown campaigns", async () => {
      const fake = createFakeRepository();
      const service = new AssetsService(db, transactionManager, fake.repository, createCampaignAccess("EDITOR"));

      await expect(
        service.createBase(
          db,
          { actorId: ACTOR_ID, campaignId: null },
          { assetType: "ITEM", title: "Rope", assetFamilyId: FAMILY_ID },
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      await expect(
        service.createBase(
          db,
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
