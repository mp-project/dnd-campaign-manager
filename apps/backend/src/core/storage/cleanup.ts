import type { StoragePort } from "#core/storage/port";

export type CleanupOrphanedObjectsParams = {
  storage: StoragePort;
  prefix?: string;
  isReferenced: (key: string) => Promise<boolean>;
  maxDeletes?: number;
};

export type CleanupOrphanedObjectsResult = {
  scanned: number;
  deleted: number;
  skipped: number;
};

/**
 * Deletes unreferenced objects in storage under an optional prefix.
 *
 * @param params Cleanup configuration with storage adapter, reference check, and limits.
 * @returns Summary with scanned, deleted, and skipped object counts.
 */
export async function cleanupOrphanedObjects(
  params: CleanupOrphanedObjectsParams,
): Promise<CleanupOrphanedObjectsResult> {
  if (!params.storage.listKeys) {
    throw new Error("Storage implementation does not support listKeys");
  }

  const keys = await params.storage.listKeys(params.prefix);
  let deleted = 0;
  let skipped = 0;
  const maxDeletes = params.maxDeletes ?? Number.POSITIVE_INFINITY;

  for (const key of keys) {
    const referenced = await params.isReferenced(key);

    if (referenced || deleted >= maxDeletes) {
      skipped += 1;
      continue;
    }

    await params.storage.delete(key);
    deleted += 1;
  }

  return {
    scanned: keys.length,
    deleted,
    skipped,
  };
}
