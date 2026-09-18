import type { CampaignContext } from "#core/http/request-context";

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
