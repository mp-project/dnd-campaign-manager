import type { CampaignContext } from "#core/http/request-context";

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
