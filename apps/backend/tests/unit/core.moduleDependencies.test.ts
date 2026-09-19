import { z } from "zod";

import {
  AssetRelationRegistry,
  AssetTypeRegistry,
  type SessionSelection,
  SessionContentResolver,
  SessionContentProviderRegistry,
  UsageAggregator,
  UsageProviderRegistry,
} from "#core/app/moduleDependencies";
import { createCampaignContextFactory } from "#test/helpers/factories";

describe("core module dependencies", () => {
  it("validates asset type and relation registrations and freezes registries", () => {
    const assetTypeRegistry = new AssetTypeRegistry();
    const relationRegistry = new AssetRelationRegistry();

    assetTypeRegistry.register("spells", [
      {
        type: "SPELL",
        module: "spells",
        detailRoute: "/spells/:id",
        editorRoute: "/editor/spells/:id",
      },
      {
        type: "CLASS",
        module: "classes",
        detailRoute: "/classes/:id",
        editorRoute: "/editor/classes/:id",
      },
    ]);

    relationRegistry.register(
      "spells",
      [
        {
          sourceType: "SPELL",
          relationType: "REQUIRES_CLASS",
          targetTypes: ["CLASS"],
          metadataSchema: z.strictObject({
            minLevel: z.number().int().min(1).max(20),
          }),
          canonicalize: (metadata) => ({
            ...metadata,
            minLevel: Number(metadata.minLevel ?? 1),
          }),
        },
      ],
      assetTypeRegistry,
    );

    const normalized = relationRegistry.validateMetadata({
      sourceType: "SPELL",
      relationType: "REQUIRES_CLASS",
      metadata: {
        minLevel: 3,
      },
    });

    expect(normalized).toEqual({ minLevel: 3 });

    assetTypeRegistry.freeze();
    relationRegistry.freeze();

    expect(() =>
      assetTypeRegistry.register("x", [
        {
          type: "NEW",
          module: "x",
          detailRoute: "/x",
          editorRoute: "/x",
        },
      ]),
    ).toThrow("frozen");

    expect(() =>
      relationRegistry.register(
        "x",
        [
          {
            sourceType: "SPELL",
            relationType: "X",
            targetTypes: ["CLASS"],
            metadataSchema: z.strictObject({}),
          },
        ],
        assetTypeRegistry,
      ),
    ).toThrow("frozen");
  });

  it("isolates usage provider failures and filters usages by campaign and player visibility", async () => {
    const context = createCampaignContextFactory({
      campaignId: "campaign-a",
      campaignRole: "PLAYER",
    });
    const registry = new UsageProviderRegistry();

    registry.register("links", [
      {
        module: "links",
        findUsages: async () => [
          {
            usageType: "LINK",
            sourceModule: "links",
            sourceId: "link-1",
            targetId: "asset-1",
            campaignId: "campaign-a",
            label: "Visible",
            route: "/links/1",
            playerVisible: true,
          },
          {
            usageType: "LINK",
            sourceModule: "links",
            sourceId: "link-2",
            targetId: "asset-1",
            campaignId: "campaign-a",
            label: "Hidden",
            route: "/links/2",
            playerVisible: false,
          },
          {
            usageType: "LINK",
            sourceModule: "links",
            sourceId: "link-3",
            targetId: "asset-1",
            campaignId: "campaign-b",
            label: "Foreign",
            route: "/links/3",
            playerVisible: true,
          },
        ],
      },
    ]);

    registry.register("broken", [
      {
        module: "broken",
        findUsages: async () => {
          throw new Error("provider failed");
        },
      },
    ]);

    const aggregator = new UsageAggregator(registry);
    const result = await aggregator.findUsages("asset-1", context);

    expect(result.usages).toEqual([
      expect.objectContaining({ sourceId: "link-1" }),
    ]);
    expect(result.providerErrors).toEqual([
      {
        module: "broken",
        message: "provider failed",
      },
    ]);
  });

  it("resolves session selections in provider batches", async () => {
    const context = createCampaignContextFactory();
    const registry = new SessionContentProviderRegistry();
    const resolveBatchA = jest.fn(async (selections: readonly SessionSelection[]) =>
      selections.map((selection) => ({
        selection,
        allowed: true,
        payload: { provider: "A" },
      })),
    );
    const resolveBatchB = jest.fn(async (selections: readonly SessionSelection[]) =>
      selections.map((selection) => ({
        selection,
        allowed: true,
        payload: { provider: "B" },
      })),
    );

    registry.register("provider-a", [
      {
        module: "provider-a",
        assetTypes: ["SPELL", "CLASS"],
        listSelections: async () => [],
        resolveBatch: resolveBatchA,
      },
    ]);

    registry.register("provider-b", [
      {
        module: "provider-b",
        assetTypes: ["ITEM"],
        listSelections: async () => [],
        resolveBatch: resolveBatchB,
      },
    ]);

    const resolver = new SessionContentResolver(registry);

    const resolved = await resolver.resolveBatch(
      [
        { assetType: "SPELL", kind: "ASSET", selectionId: "spell-1" },
        { assetType: "CLASS", kind: "SECTION", selectionId: "class-1" },
        { assetType: "ITEM", kind: "SUBRESOURCE", selectionId: "item-1" },
      ],
      context,
    );

    expect(resolveBatchA).toHaveBeenCalledTimes(1);
    expect(resolveBatchB).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveLength(3);
  });
});
