import { and, type AnyColumn, asc, eq, gt, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow, type AssetStatus } from "#src/modules/assets/index";
import type { CreatureType } from "#src/modules/species/domain/dto/BaseSpeciesDto";
import type { SpeciesSize } from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import { species, speciesVariants } from "#src/modules/species/domain/entities/SpeciesTable";

export type SpeciesRow = typeof species.$inferSelect;
export type SpeciesVariantRow = typeof speciesVariants.$inferSelect;

/** A species with its asset, which holds name, summary, status and rulesets. */
export type SpeciesWithAsset = { species: SpeciesRow; asset: AssetRow };
export type SpeciesRecord = SpeciesWithAsset & { rulesetIds: readonly string[] };

/** A variant with its asset and the asset of its species. */
export type SpeciesVariantWithAsset = {
  variant: SpeciesVariantRow;
  asset: AssetRow;
  speciesAssetId: string;
};
export type SpeciesVariantRecord = SpeciesVariantWithAsset & { rulesetIds: readonly string[] };

export type SpeciesPage = { items: SpeciesWithAsset[]; hasMore: boolean };

export type SpeciesListFilter = {
  limit: number;
  cursor?: string | undefined;
  creatureType?: CreatureType | undefined;
  size?: SpeciesSize | undefined;
  search?: string | undefined;
  /**
   * Global species with these statuses, plus the archived ones among `archivedAssetIds`; omitted
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
   * Species of this campaign with these statuses (only `assetIds` if given, e.g. those a player may
   * see), plus the archived ones among `archivedAssetIds`; omitted means none.
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

/** Grant paths that refer to assets; text that happens to look like an id is no usage. */
const GRANT_REFERENCE_PATHS = [
  "$[*].featureAssetId ? (@ == $id)",
  "$[*].targetFeatureAssetId ? (@ == $id)",
  '$[*].bindings[*] ? (@.bindingSource == "STATIC" && @.staticValue == $id)',
];

/** Species and variant rows only change through the history; reads join their assets. */
export class SpeciesRepository {
  // ---------------------------------------------------------------------------
  // Species
  // ---------------------------------------------------------------------------

  async findById(db: AppDatabase, speciesId: string): Promise<SpeciesWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(species.id, speciesId), isNull(species.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, SpeciesWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(species.assetId, [...new Set(assetIds)]), isNull(species.deletedAt)),
    );

    return new Map(rows.map((row) => [row.species.assetId, row]));
  }

  /** Other global species with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptSpeciesId: string },
  ): Promise<SpeciesWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(species.deletedAt),
        isNull(species.campaignId),
        eq(species.code, input.code),
        ne(species.id, input.exceptSpeciesId),
      ),
    );
  }

  /**
   * Locks the species row until the transaction ends. Writes of the species and of its variants
   * take it before they check each other, so a species change and a variant change of the same
   * species run one after the other (groups, keys and targets stay consistent). Read the species
   * and its variants again after taking it.
   */
  async lockSpecies(db: AppDatabase, speciesId: string): Promise<void> {
    await db.select({ id: species.id }).from(species).where(eq(species.id, speciesId)).for("update");
  }

  /** Keeps two transactions from giving global species the same code at the same time. */
  async lockSystemCode(db: AppDatabase, code: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`species.code:${code}`}))`);
  }

  async listPage(db: AppDatabase, filter: SpeciesListFilter): Promise<SpeciesPage> {
    const scopes: SQL[] = [];
    const archivedAmong = (assetIds: readonly string[] | undefined) =>
      assetIds && assetIds.length > 0
        ? and(eq(assets.status, "ARCHIVED"), inArray(species.assetId, [...assetIds]))
        : undefined;
    const withStatuses = (statuses: readonly AssetStatus[], assetIds?: readonly string[]) =>
      statuses.length > 0 && assetIds?.length !== 0
        ? and(
            inArray(assets.status, [...statuses]),
            assetIds ? inArray(species.assetId, [...assetIds]) : undefined,
          )
        : undefined;

    if (filter.system) {
      const status = or(
        withStatuses(filter.system.statuses),
        archivedAmong(filter.system.archivedAssetIds),
      );

      if (status) {
        scopes.push(and(isNull(species.campaignId), status, filter.system.rulesetCondition) as SQL);
      }
    }

    if (filter.campaign) {
      const status = or(
        withStatuses(filter.campaign.statuses, filter.campaign.assetIds),
        archivedAmong(filter.campaign.archivedAssetIds),
      );

      if (status) {
        scopes.push(and(eq(species.campaignId, filter.campaign.campaignId), status) as SQL);
      }
    }

    if (scopes.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(species.deletedAt),
          or(...scopes),
          filter.creatureType ? eq(species.creatureType, filter.creatureType) : undefined,
          filter.size
            ? sql`jsonb_path_exists(${species.sizeOptions}, '$[*] ? (@.size == $size)', jsonb_build_object('size', ${filter.size}::text))`
            : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(species.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(species.code), asc(species.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Species whose grants refer to the asset. `campaignId` limits them to global species and those
   * of the campaign; null searches everywhere, for global assets. Archived species only with
   * `includeArchived`.
   */
  async listReferencing(
    db: AppDatabase,
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
  ): Promise<SpeciesWithAsset[]> {
    return this.selectWithAsset(db)
      .where(
        and(
          isNull(species.deletedAt),
          input.campaignId
            ? or(isNull(species.campaignId), eq(species.campaignId, input.campaignId))
            : undefined,
          input.includeArchived ? undefined : sql`${assets.status} <> 'ARCHIVED'`,
          this.grantsReferTo(species.featureGrants, input.assetId),
        ),
      )
      .orderBy(asc(species.code), asc(species.id));
  }

  // ---------------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------------

  async findVariantById(db: AppDatabase, variantId: string): Promise<SpeciesVariantWithAsset | null> {
    const [row] = await this.selectVariantWithAsset(db).where(
      and(eq(speciesVariants.id, variantId), isNull(speciesVariants.deletedAt)),
    );

    return row ?? null;
  }

  async findVariantsByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, SpeciesVariantWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectVariantWithAsset(db).where(
      and(inArray(speciesVariants.assetId, [...new Set(assetIds)]), isNull(speciesVariants.deletedAt)),
    );

    return new Map(rows.map((row) => [row.variant.assetId, row]));
  }

  /** All variants of the species, archived ones included; a species has few of them. */
  async listVariants(db: AppDatabase, speciesId: string): Promise<SpeciesVariantWithAsset[]> {
    return this.selectVariantWithAsset(db)
      .where(and(eq(speciesVariants.speciesId, speciesId), isNull(speciesVariants.deletedAt)))
      .orderBy(asc(speciesVariants.displayOrder), asc(speciesVariants.code), asc(speciesVariants.id));
  }

  /**
   * Variants whose grants refer to the asset, or whose species it is. Same limits as
   * `listReferencing`.
   */
  async listVariantsReferencing(
    db: AppDatabase,
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
  ): Promise<SpeciesVariantWithAsset[]> {
    return this.selectVariantWithAsset(db)
      .where(
        and(
          isNull(speciesVariants.deletedAt),
          input.campaignId
            ? or(isNull(speciesVariants.campaignId), eq(speciesVariants.campaignId, input.campaignId))
            : undefined,
          input.includeArchived ? undefined : sql`${assets.status} <> 'ARCHIVED'`,
          or(
            eq(species.assetId, input.assetId),
            this.grantsReferTo(speciesVariants.featureGrants, input.assetId),
          ),
        ),
      )
      .orderBy(asc(speciesVariants.code), asc(speciesVariants.id));
  }

  /**
   * Feature asset ids that active released custom species and variants of the campaign grant or
   * target. A variant only counts while its species is active and released as well, since players
   * reach variants through their species. Read straight from the stored json, so a definition that
   * no longer parses cannot break what players see elsewhere.
   */
  async listReleasedReferencedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const referencedIds = (column: AnyColumn) => sql`
      cross join lateral (
        select jsonb_path_query(${column}, '$[*].featureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${column}, '$[*].targetFeatureAssetId') #>> '{}'
      ) as ids(id)
    `;
    const released = (asset: { deletedAt: AnyColumn; status: AnyColumn; releasedToPlayers: AnyColumn }) =>
      sql`${asset.deletedAt} is null and ${asset.status} = 'ACTIVE' and ${asset.releasedToPlayers} = true`;
    const speciesAsset = alias(assets, "species_asset");
    const rows = await db.execute<{ id: string }>(sql`
      select ids.id
      from ${species}
      join ${assets} on ${assets.id} = ${species.assetId}
      ${referencedIds(species.featureGrants)}
      where ${species.deletedAt} is null
        and ${species.campaignId} = ${campaignId}
        and ${released(assets)}
        and ids.id is not null
      union
      select ids.id
      from ${speciesVariants}
      join ${assets} on ${assets.id} = ${speciesVariants.assetId}
      join ${species} on ${species.id} = ${speciesVariants.speciesId} and ${species.deletedAt} is null
      join ${assets} as ${sql.identifier("species_asset")} on ${speciesAsset.id} = ${species.assetId}
      ${referencedIds(speciesVariants.featureGrants)}
      where ${speciesVariants.deletedAt} is null
        and ${speciesVariants.campaignId} = ${campaignId}
        and ${released(assets)}
        and ${released(speciesAsset)}
        and ids.id is not null
    `);

    return rows.rows.map((row) => row.id);
  }

  private grantsReferTo(column: AnyColumn, assetId: string): SQL {
    const vars = sql`jsonb_build_object('id', ${assetId}::text)`;

    return or(
      ...GRANT_REFERENCE_PATHS.map(
        (path) => sql`jsonb_path_exists(${column}, ${path}::jsonpath, ${vars})`,
      ),
    ) as SQL;
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ species, asset: assets })
      .from(species)
      .innerJoin(assets, and(eq(assets.id, species.assetId), isNull(assets.deletedAt)));
  }

  private selectVariantWithAsset(db: AppDatabase) {
    return db
      .select({ variant: speciesVariants, asset: assets, speciesAssetId: species.assetId })
      .from(speciesVariants)
      .innerJoin(assets, and(eq(assets.id, speciesVariants.assetId), isNull(assets.deletedAt)))
      .innerJoin(species, eq(species.id, speciesVariants.speciesId));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(species.code, value), and(eq(species.code, value), gt(species.id, id)));
  }
}
