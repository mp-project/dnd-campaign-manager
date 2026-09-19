import { z } from "zod";

import type { CampaignContext } from "#core/http/requestContext";

export type AssetTypeDefinition = {
  type: string;
  module: string;
  detailRoute: string;
  editorRoute: string;
};

export type AssetRelationDefinition = {
  sourceType: string;
  relationType: string;
  targetTypes: readonly string[];
  metadataSchema: z.ZodType<Record<string, unknown>>;
  canonicalize?: (metadata: Record<string, unknown>) => Record<string, unknown>;
};

export type AssetUsage = {
  usageType: string;
  sourceModule: string;
  sourceId: string;
  targetId: string;
  campaignId: string | null;
  label: string | null;
  route: string | null;
  playerVisible: boolean;
};

export type UsageProvider = {
  module: string;
  findUsages(input: {
    assetId: string;
    context: CampaignContext;
  }): Promise<AssetUsage[]>;
};

export type UsageAggregationResult = {
  usages: AssetUsage[];
  providerErrors: Array<{
    module: string;
    message: string;
  }>;
};

export const sessionSelectionKinds = ["ASSET", "SECTION", "SUBRESOURCE"] as const;

export type SessionSelectionKind = (typeof sessionSelectionKinds)[number];

export type SessionSelection = {
  assetType: string;
  kind: SessionSelectionKind;
  selectionId: string;
};

export type SessionResolvedContent = {
  selection: SessionSelection;
  allowed: boolean;
  payload: unknown;
};

export type SessionContentProvider = {
  module: string;
  assetTypes: readonly string[];
  listSelections(assetId: string): Promise<SessionSelection[]>;
  resolveBatch(
    selections: readonly SessionSelection[],
    viewerContext: CampaignContext,
  ): Promise<SessionResolvedContent[]>;
};

/**
 * Registry for declared asset types across modules.
 */
export class AssetTypeRegistry {
  private readonly definitionsByType = new Map<string, AssetTypeDefinition>();

  private frozen = false;

  register(moduleName: string, definitions: readonly AssetTypeDefinition[]): void {
    this.assertMutable();

    for (const definition of definitions) {
      const type = definition.type.trim();

      if (!type) {
        throw new Error(`Module '${moduleName}' tried to register an empty asset type`);
      }

      if (this.definitionsByType.has(type)) {
        throw new Error(`Asset type '${type}' is already registered`);
      }

      this.definitionsByType.set(type, {
        ...definition,
        type,
      });
    }
  }

  get(type: string): AssetTypeDefinition | undefined {
    return this.definitionsByType.get(type);
  }

  list(): AssetTypeDefinition[] {
    return [...this.definitionsByType.values()];
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new Error("AssetTypeRegistry is frozen");
    }
  }
}

/**
 * Registry for typed relations between source and target asset types.
 */
export class AssetRelationRegistry {
  private readonly definitionsByKey = new Map<string, AssetRelationDefinition>();

  private frozen = false;

  register(
    moduleName: string,
    definitions: readonly AssetRelationDefinition[],
    assetTypeRegistry: AssetTypeRegistry,
  ): void {
    this.assertMutable();

    for (const definition of definitions) {
      if (!assetTypeRegistry.get(definition.sourceType)) {
        throw new Error(
          `Module '${moduleName}' registered relation '${definition.relationType}' with unknown source type '${definition.sourceType}'`,
        );
      }

      for (const targetType of definition.targetTypes) {
        if (!assetTypeRegistry.get(targetType)) {
          throw new Error(
            `Module '${moduleName}' registered relation '${definition.relationType}' with unknown target type '${targetType}'`,
          );
        }
      }

      const key = this.toKey(definition.sourceType, definition.relationType);

      if (this.definitionsByKey.has(key)) {
        throw new Error(
          `Relation '${definition.relationType}' for source '${definition.sourceType}' is already registered`,
        );
      }

      this.definitionsByKey.set(key, definition);
    }
  }

  get(sourceType: string, relationType: string): AssetRelationDefinition | undefined {
    return this.definitionsByKey.get(this.toKey(sourceType, relationType));
  }

  list(): AssetRelationDefinition[] {
    return [...this.definitionsByKey.values()];
  }

  validateMetadata(input: {
    sourceType: string;
    relationType: string;
    metadata: unknown;
  }): Record<string, unknown> {
    const definition = this.get(input.sourceType, input.relationType);

    if (!definition) {
      throw new Error(
        `Unknown relation '${input.relationType}' for source type '${input.sourceType}'`,
      );
    }

    const parsed = definition.metadataSchema.parse(input.metadata);

    if (definition.canonicalize) {
      return definition.canonicalize(parsed);
    }

    return parsed;
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  private toKey(sourceType: string, relationType: string): string {
    return `${sourceType}::${relationType}`;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new Error("AssetRelationRegistry is frozen");
    }
  }
}

/**
 * Registry for session content providers per asset type.
 */
export class SessionContentProviderRegistry {
  private readonly providersByModule = new Map<string, SessionContentProvider>();
  private readonly providerByAssetType = new Map<string, SessionContentProvider>();

  private frozen = false;

  register(moduleName: string, providers: readonly SessionContentProvider[]): void {
    this.assertMutable();

    for (const provider of providers) {
      if (this.providersByModule.has(provider.module)) {
        throw new Error(
          `Session content provider module '${provider.module}' is already registered (registered from '${moduleName}')`,
        );
      }

      for (const assetType of provider.assetTypes) {
        if (this.providerByAssetType.has(assetType)) {
          throw new Error(`Session content provider for asset type '${assetType}' is already registered`);
        }
      }

      this.providersByModule.set(provider.module, provider);

      for (const assetType of provider.assetTypes) {
        this.providerByAssetType.set(assetType, provider);
      }
    }
  }

  getProviderForAssetType(assetType: string): SessionContentProvider | undefined {
    return this.providerByAssetType.get(assetType);
  }

  list(): SessionContentProvider[] {
    return [...this.providersByModule.values()];
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new Error("SessionContentProviderRegistry is frozen");
    }
  }
}

/**
 * Resolves session selections in provider batches to avoid per-selection calls.
 */
export class SessionContentResolver {
  constructor(private readonly registry: SessionContentProviderRegistry) {}

  async resolveBatch(
    selections: readonly SessionSelection[],
    viewerContext: CampaignContext,
  ): Promise<SessionResolvedContent[]> {
    const selectionsByProvider = new Map<SessionContentProvider, SessionSelection[]>();

    for (const selection of selections) {
      const provider = this.registry.getProviderForAssetType(selection.assetType);

      if (!provider) {
        continue;
      }

      const existing = selectionsByProvider.get(provider);

      if (existing) {
        existing.push(selection);
      } else {
        selectionsByProvider.set(provider, [selection]);
      }
    }

    const resolved: SessionResolvedContent[] = [];

    for (const [provider, providerSelections] of selectionsByProvider.entries()) {
      const providerResolved = await provider.resolveBatch(providerSelections, viewerContext);
      resolved.push(...providerResolved);
    }

    return resolved;
  }
}

/**
 * Registry for asset usage providers.
 */
export class UsageProviderRegistry {
  private readonly providersByModule = new Map<string, UsageProvider>();

  private frozen = false;

  register(moduleName: string, providers: readonly UsageProvider[]): void {
    this.assertMutable();

    for (const provider of providers) {
      if (this.providersByModule.has(provider.module)) {
        throw new Error(
          `Usage provider module '${provider.module}' is already registered (registered from '${moduleName}')`,
        );
      }

      this.providersByModule.set(provider.module, provider);
    }
  }

  list(): UsageProvider[] {
    return [...this.providersByModule.values()];
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new Error("UsageProviderRegistry is frozen");
    }
  }
}

/**
 * Aggregates usages from all registered providers and isolates provider failures.
 */
export class UsageAggregator {
  constructor(private readonly registry: UsageProviderRegistry) {}

  async findUsages(assetId: string, context: CampaignContext): Promise<UsageAggregationResult> {
    const providers = this.registry.list();
    const settledResults = await Promise.allSettled(
      providers.map((provider) => provider.findUsages({ assetId, context })),
    );

    const usages: AssetUsage[] = [];
    const providerErrors: UsageAggregationResult["providerErrors"] = [];

    for (let index = 0; index < settledResults.length; index += 1) {
      const settled = settledResults[index];
      const provider = providers[index];

      if (!provider) {
        continue;
      }

      if (!settled) {
        continue;
      }

      if (settled.status === "rejected") {
        providerErrors.push({
          module: provider.module,
          message: settled.reason instanceof Error ? settled.reason.message : "unknown",
        });
        continue;
      }

      for (const usage of settled.value) {
        if (usage.campaignId && usage.campaignId !== context.campaignId) {
          continue;
        }

        if (context.campaignRole === "PLAYER" && !usage.playerVisible) {
          continue;
        }

        usages.push(usage);
      }
    }

    return {
      usages,
      providerErrors,
    };
  }
}
