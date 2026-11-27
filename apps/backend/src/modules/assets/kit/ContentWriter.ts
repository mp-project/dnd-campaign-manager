import type { AppDatabase } from "#core/db/pool";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/service/AssetsService";

/**
 * The types of one kind of content on assets, as one parameter for the writer and the use cases:
 * how its write routes name it (`path`), what loading it for a write gives (`found`), what the
 * writes return (`record`) and the commands of create and update.
 */
export type ContentTypes = {
  /** `campaignId` null addresses global content, which only administrators may change. */
  path: { campaignId: string | null };
  found: { asset: { id: string } };
  record: unknown;
  create: unknown;
  update: unknown;
};

/** Who creates content and where: `campaignId` null creates global content. */
export type ContentOwner = { actorId: string; campaignId: string | null };

export type ContentLifecycleChange<T extends ContentTypes> = {
  found: T["found"];
  expectedAssetVersion: number;
};

export type ContentUpdate<T extends ContentTypes> = {
  found: T["found"];
  actorId: string;
  command: T["update"];
};

/** `merged` names the fields that kept a newer value from somebody else. */
export type ContentUpdateResult<T extends ContentTypes> = { record: T["record"]; merged: string[] };

/**
 * What the shared write use cases (`CreateContentUseCase` …) need from a module: the write rule,
 * loading and the writes themselves. A module with several kinds of content (spells and their
 * lists) provides one writer per kind.
 */
export interface ContentWriter<T extends ContentTypes> {
  /** Throws unless the actor may write content of the campaign (global: administrators only). */
  assertCanWrite(context: RequestContext, campaignId: string | null, db: AppDatabase): Promise<string>;
  /** The acting user; throws without a session. */
  actorIdOf(context: RequestContext): string;
  /** The content to change, in the scope the path names (404 otherwise). */
  requireForWrite(db: AppDatabase, path: T["path"]): Promise<T["found"]>;
  create(scope: ActionScope, owner: ContentOwner, command: T["create"]): Promise<T["record"]>;
  update(scope: ActionScope, change: ContentUpdate<T>): Promise<ContentUpdateResult<T>>;
  archive(scope: ActionScope, change: ContentLifecycleChange<T>): Promise<T["record"]>;
  restore(scope: ActionScope, change: ContentLifecycleChange<T>): Promise<T["record"]>;
}

/** The parts of a writer only the module knows; `assetContentWriter` adds the rest. */
export type ContentWriterParts<T extends ContentTypes> = Pick<
  ContentWriter<T>,
  "requireForWrite" | "create" | "update"
> & {
  /** Loads the record again after its asset changed (archived or restored). */
  reload(db: AppDatabase, found: T["found"]): Promise<T["record"]>;
};

/**
 * A writer for content on assets: the write rule, the acting user, archiving and restoring come
 * from the content kernel (`AssetsService`), the module adds loading and its own writes.
 */
export function assetContentWriter<T extends ContentTypes>(
  assets: AssetsService,
  parts: ContentWriterParts<T>,
): ContentWriter<T> {
  return {
    assertCanWrite: (context, campaignId, db) => assets.assertCanWrite(context, "EDIT", campaignId, db),
    actorIdOf: (context) => assets.assertAuthenticated(context),
    requireForWrite: (db, path) => parts.requireForWrite(db, path),
    create: (scope, owner, command) => parts.create(scope, owner, command),
    update: (scope, change) => parts.update(scope, change),
    archive: async (scope, change) => {
      await assets.archiveBase(scope, {
        assetId: change.found.asset.id,
        expectedVersion: change.expectedAssetVersion,
      });

      return parts.reload(scope.tx, change.found);
    },
    restore: async (scope, change) => {
      await assets.restoreBase(scope, {
        assetId: change.found.asset.id,
        expectedVersion: change.expectedAssetVersion,
      });

      return parts.reload(scope.tx, change.found);
    },
  };
}
