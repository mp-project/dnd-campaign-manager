import { randomUUID } from "node:crypto";

import { StorageError } from "#core/storage/errors";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!uuidPattern.test(value)) {
    throw new StorageError("INVALID_KEY", `${label} must be a UUID`, {
      statusCode: 400,
      details: { label, value },
    });
  }
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export type CreateStorageObjectKeyInput = {
  namespace: string;
  ownerId: string;
  objectId?: string;
  extension?: string | null;
};

/**
 * Builds a namespaced storage key and validates owner/object UUID constraints.
 *
 * @param input Namespace, owner id, optional object id and file extension.
 * @returns Generated object id and canonical key path.
 */
export function createStorageObjectKey(input: CreateStorageObjectKeyInput): {
  objectId: string;
  key: string;
} {
  const objectId = input.objectId ?? randomUUID();

  assertUuid(input.ownerId, "ownerId");
  assertUuid(objectId, "objectId");

  const namespace = sanitizeSegment(input.namespace);

  if (!namespace) {
    throw new StorageError("INVALID_KEY", "namespace must not be empty", {
      statusCode: 400,
    });
  }

  const normalizedExtension =
    input.extension && input.extension.startsWith(".")
      ? input.extension.toLowerCase()
      : input.extension
        ? `.${input.extension.toLowerCase()}`
        : "";

  return {
    objectId,
    key: `${namespace}/${input.ownerId}/${objectId}${normalizedExtension}`,
  };
}

/**
 * Creates a temporary storage key for upload staging.
 *
 * @param objectId Optional object id to reuse while preserving UUID validation.
 * @returns Temporary object key in the tmp namespace.
 */
export function createTemporaryObjectKey(objectId: string = randomUUID()): string {
  assertUuid(objectId, "objectId");

  return `tmp/${objectId}`;
}
