import { and, asc, eq, gt, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { escapeLike } from "#core/db/escapeLike";

import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow, type AssetStatus } from "#src/modules/assets/index";
import type { FeatureType } from "#src/modules/features/domain/dto/BaseFeatureDto";
import { features } from "#src/modules/features/domain/entities/FeaturesTable";

export type FeatureRow = typeof features.$inferSelect;

/** A feature with its asset, which holds name, summary, status and rulesets. */
export type FeatureWithAsset = { feature: FeatureRow; asset: AssetRow };

export type FeatureRecord = FeatureWithAsset & { rulesetIds: readonly string[] };

export type FeaturePage = { items: FeatureWithAsset[]; hasMore: boolean };

export type FeatureListFilter = {
  limit: number;
  cursor?: string | undefined;
  featureType?: FeatureType | undefined;
  search?: string | undefined;
  /**
   * Global features with these statuses, plus the archived ones among `archivedAssetIds`; omitted
   * means none.
   */
  system?:
    | {
        statuses: readonly AssetStatus[];
        archivedAssetIds?: readonly string[] | undefined;
        rulesetCondition?: SQL | undefined;
      }
    | undefined;
  /**
   * Features of this campaign with these statuses (only `assetIds` if given, e.g. those a player
   * may see), plus the archived ones among `archivedAssetIds`; omitted means none.
   */
  campaign?:
    | {
        campaignId: string;
        statuses: readonly AssetStatus[];
        assetIds?: readonly string[] | undefined;
        archivedAssetIds?: readonly string[] | undefined;
      }
    | undefined;
};

/** A feature whose definition refers to an asset. */
export type FeatureReferenceRow = {
  featureId: string;
  campaignId: string | null;
  asset: AssetRow;
  kinds: ("SUPERSEDES" | "CHOICE_OPTION" | "PARAMETER_DEFAULT")[];
};

/** Feature rows only change through the history; reads join the asset they belong to. */
export class FeaturesRepository {
  async findById(db: AppDatabase, featureId: string): Promise<FeatureWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(features.id, featureId), isNull(features.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetId(db: AppDatabase, assetId: string): Promise<FeatureWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(features.assetId, assetId), isNull(features.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, FeatureWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(features.assetId, [...new Set(assetIds)]), isNull(features.deletedAt)),
    );

    return new Map(rows.map((row) => [row.feature.assetId, row]));
  }

  async listPage(db: AppDatabase, filter: FeatureListFilter): Promise<FeaturePage> {
    const scopes: SQL[] = [];
    const archivedAmong = (assetIds: readonly string[] | undefined) =>
      assetIds && assetIds.length > 0
        ? and(eq(assets.status, "ARCHIVED"), inArray(features.assetId, [...assetIds]))
        : undefined;
    const withStatuses = (statuses: readonly AssetStatus[], assetIds?: readonly string[]) =>
      statuses.length > 0 && assetIds?.length !== 0
        ? and(
            inArray(assets.status, [...statuses]),
            assetIds ? inArray(features.assetId, [...assetIds]) : undefined,
          )
        : undefined;

    if (filter.system) {
      const status = or(
        withStatuses(filter.system.statuses),
        archivedAmong(filter.system.archivedAssetIds),
      );

      if (status) {
        scopes.push(
          and(isNull(features.campaignId), status, filter.system.rulesetCondition) as SQL,
        );
      }
    }

    if (filter.campaign) {
      const status = or(
        withStatuses(filter.campaign.statuses, filter.campaign.assetIds),
        archivedAmong(filter.campaign.archivedAssetIds),
      );

      if (status) {
        scopes.push(and(eq(features.campaignId, filter.campaign.campaignId), status) as SQL);
      }
    }

    if (scopes.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(features.deletedAt),
          or(...scopes),
          filter.featureType ? eq(features.featureType, filter.featureType) : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(features.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(features.code), asc(features.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Features whose definition refers to the asset: as supersede target, linked choice option or
   * default of an asset parameter. `campaignId` limits them to global features and those of the
   * campaign; null searches everywhere, for global assets. Archived features only with
   * `includeArchived`.
   */
  async listReferencing(
    db: AppDatabase,
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
  ): Promise<FeatureReferenceRow[]> {
    const id = sql`${input.assetId}::text`;
    const supersedes = sql`${features.supersedes} @> jsonb_build_array(jsonb_build_object('targetAssetId', ${id}))`;
    const choiceOption = sql`jsonb_path_exists(${features.choices}, '$[*].options[*] ? (@.linkedAssetId == $id)', jsonb_build_object('id', ${id}))`;
    const parameterDefault = sql`jsonb_path_exists(${features.parameters}, '$[*] ? (@.valueType == "ASSET_REF" && @.defaultValue == $id)', jsonb_build_object('id', ${id}))`;

    const rows = await db
      .select({
        featureId: features.id,
        campaignId: features.campaignId,
        asset: assets,
        supersedes: sql<boolean>`${supersedes}`,
        choiceOption: sql<boolean>`${choiceOption}`,
        parameterDefault: sql<boolean>`${parameterDefault}`,
      })
      .from(features)
      .innerJoin(assets, and(eq(assets.id, features.assetId), isNull(assets.deletedAt)))
      .where(
        and(
          isNull(features.deletedAt),
          input.campaignId
            ? or(isNull(features.campaignId), eq(features.campaignId, input.campaignId))
            : undefined,
          input.includeArchived ? undefined : sql`${assets.status} <> 'ARCHIVED'`,
          or(supersedes, choiceOption, parameterDefault),
        ),
      )
      .orderBy(asc(features.code), asc(features.id));

    return rows.map((row) => ({
      featureId: row.featureId,
      campaignId: row.campaignId,
      asset: row.asset,
      kinds: [
        ...(row.supersedes ? (["SUPERSEDES"] as const) : []),
        ...(row.choiceOption ? (["CHOICE_OPTION"] as const) : []),
        ...(row.parameterDefault ? (["PARAMETER_DEFAULT"] as const) : []),
      ],
    }));
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ feature: features, asset: assets })
      .from(features)
      .innerJoin(assets, and(eq(assets.id, features.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(features.code, value), and(eq(features.code, value), gt(features.id, id)));
  }
}
