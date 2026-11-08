import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import type { ContentReadPurpose } from "#core/content/access";
import type { ContentViewer } from "#core/content/viewer";
import type { AppDatabase } from "#core/db/pool";
import { NotFoundError } from "#core/error/http/index";
import { assets } from "#src/modules/assets/domain/entities/AssetsTable";
import type {
  AssetRow,
  AssetsRepository,
} from "#src/modules/assets/domain/repository/AssetsRepository";

type ContentAccessDeps = { db: AppDatabase; repository: AssetsRepository };

const NEVER: SQL = sql`false`;

/**
 * The one decision who may read which content of a campaign, for one request. Built by
 * `AssetsService.access`, which loads the grants once: the assets shared or released to a player
 * (`visibleAssetIds`) and the archived ones the campaign still uses (`inUseAssetIds`). Every read
 * path asks it instead of combining status, scope and grants itself; see `ContentReadPurpose`.
 *
 * Whatever the viewer may not read is reported as missing (404), so ids of hidden content leak
 * nothing.
 */
export class ContentAccess {
  constructor(
    readonly viewer: ContentViewer,
    readonly visibleAssetIds: ReadonlySet<string>,
    readonly inUseAssetIds: ReadonlySet<string>,
    private readonly deps: ContentAccessDeps,
  ) {}

  get isFullView(): boolean {
    return this.viewer.view === "FULL";
  }

  /** Ids of the assets the viewer may read for this purpose; one query for the ruleset check. */
  async readableIds(
    purpose: ContentReadPurpose,
    items: readonly AssetRow[],
    db: AppDatabase = this.deps.db,
  ): Promise<Set<string>> {
    const needsRuleset = items.filter((asset) => this.needsRulesetCheck(purpose, asset));
    const compatible = await this.deps.repository.listCompatibleIds(
      db,
      needsRuleset.map((asset) => asset.id),
      this.viewer.rulesetId,
    );

    return new Set(
      items
        .filter((asset) => this.decide(purpose, asset, compatible.has(asset.id)))
        .map((asset) => asset.id),
    );
  }

  async filter(
    purpose: ContentReadPurpose,
    items: readonly AssetRow[],
    db: AppDatabase = this.deps.db,
  ): Promise<AssetRow[]> {
    const readable = await this.readableIds(purpose, items, db);

    return items.filter((asset) => readable.has(asset.id));
  }

  async allows(
    purpose: ContentReadPurpose,
    asset: AssetRow,
    db: AppDatabase = this.deps.db,
  ): Promise<boolean> {
    return (await this.readableIds(purpose, [asset], db)).has(asset.id);
  }

  /** Throws `NotFoundError` with `message` unless the viewer may read the asset. */
  async require(
    purpose: ContentReadPurpose,
    asset: AssetRow | null | undefined,
    message = "Asset not found",
    db: AppDatabase = this.deps.db,
  ): Promise<AssetRow> {
    if (!asset || !(await this.allows(purpose, asset, db))) {
      throw new NotFoundError(message);
    }

    return asset;
  }

  /**
   * Ids of the campaign's own assets a player may read (`MANAGE`): those granted to them and
   * archived ones in use. For the full view, which reads all of them, use `where` instead.
   */
  async listReadableOwnIds(db: AppDatabase = this.deps.db): Promise<string[]> {
    const candidates = await this.deps.repository.findByIds(db, [
      ...new Set([...this.visibleAssetIds, ...this.inUseAssetIds]),
    ]);

    return [...(await this.readableIds("MANAGE", candidates, db))];
  }

  /** The same decision as a condition on `assets`, for lists, counts and search. */
  where(purpose: ContentReadPurpose, db: AppDatabase = this.deps.db): SQL {
    const own = and(eq(assets.scope, "CAMPAIGN"), eq(assets.campaignId, this.viewer.campaignId));
    const global = eq(assets.scope, "SYSTEM");
    const inUse = this.idsIn(this.inUseAssetIds);
    const archivedInUse = and(eq(assets.status, "ARCHIVED"), inUse) as SQL;
    const offered = this.deps.repository.compatibleWith(db, this.viewer.rulesetId);

    if (!this.isFullView) {
      const visible = and(eq(assets.status, "ACTIVE"), this.idsIn(this.visibleAssetIds));
      const ownForPlayer = and(own, or(visible, archivedInUse)) as SQL;

      if (purpose === "MANAGE") {
        return ownForPlayer;
      }

      const globalActive = and(eq(assets.status, "ACTIVE"), offered);

      return or(ownForPlayer, and(global, or(globalActive, and(archivedInUse, offered)))) as SQL;
    }

    if (purpose === "MANAGE") {
      return own as SQL;
    }

    if (purpose === "CATALOG") {
      return or(
        and(own, or(inArray(assets.status, ["DRAFT", "ACTIVE"]), archivedInUse)),
        and(global, offered, or(eq(assets.status, "ACTIVE"), archivedInUse)),
      ) as SQL;
    }

    return or(
      own,
      this.viewer.isAdmin ? global : and(global, ne(assets.status, "DRAFT"), offered),
    ) as SQL;
  }

  /**
   * `where` for a list with the usual filters of the list routes: `scope` and `status` as asked.
   * Management lists of the full view leave archived content out unless it is asked for.
   */
  listWhere(
    purpose: ContentReadPurpose,
    filter: { scope?: AssetRow["scope"] | undefined; status?: AssetRow["status"] | undefined } = {},
    db: AppDatabase = this.deps.db,
  ): SQL {
    const defaultStatus =
      purpose === "MANAGE" && this.isFullView ? ne(assets.status, "ARCHIVED") : undefined;

    return and(
      this.where(purpose, db),
      filter.scope ? eq(assets.scope, filter.scope) : undefined,
      filter.status ? eq(assets.status, filter.status) : defaultStatus,
    ) as SQL;
  }

  /**
   * The rules behind `where`, for rows already loaded. `compatible` says whether a global asset
   * fits the campaign ruleset; it is only looked up where it matters.
   */
  private decide(purpose: ContentReadPurpose, asset: AssetRow, compatible: boolean): boolean {
    if (asset.scope === "CAMPAIGN" && asset.campaignId !== this.viewer.campaignId) {
      return false;
    }

    if (purpose === "MANAGE" && asset.scope !== "CAMPAIGN") {
      return false;
    }

    if (asset.scope === "SYSTEM" && this.needsRulesetCheck(purpose, asset)) {
      if (asset.status === "DRAFT" || !compatible) {
        return false;
      }
    }

    if (asset.status === "ARCHIVED" && (purpose === "CATALOG" || !this.isFullView)) {
      return this.inUseAssetIds.has(asset.id);
    }

    if (!this.isFullView) {
      return (
        asset.status === "ACTIVE" &&
        (asset.scope === "SYSTEM" || this.visibleAssetIds.has(asset.id))
      );
    }

    return true;
  }

  /** Administrators read every global asset; in the catalog the campaign ruleset counts for all. */
  private needsRulesetCheck(purpose: ContentReadPurpose, asset: AssetRow): boolean {
    return asset.scope === "SYSTEM" && (purpose === "CATALOG" || !this.viewer.isAdmin);
  }

  private idsIn(ids: ReadonlySet<string>): SQL {
    return ids.size > 0 ? inArray(assets.id, [...ids]) : NEVER;
  }
}
