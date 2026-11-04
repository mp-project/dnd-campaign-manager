import { z } from "zod";

import { ValidationError } from "#core/error/http/index";
import type { AssetType } from "#src/modules/assets/index";

export type AssetRelationDefinition = {
  /** Stored in `asset_links.relation_type`, for example `RELATED_TO`. */
  type: string;
  /** Allowed asset types; `ANY` allows all of them. */
  sourceTypes: readonly AssetType[] | "ANY";
  targetTypes: readonly AssetType[] | "ANY";
  /** Strict schema of the link metadata. */
  metadataSchema: z.ZodType<Record<string, unknown>>;
  allowSelfLink?: boolean;
  /** Allows several links with the same source, target and relation. */
  allowMultiple?: boolean;
  /** Players see links of this relation if they may also see both ends. */
  playerVisible: boolean;
  /** The target cannot be archived while such a link exists. */
  blocksTargetArchive?: boolean;
};

const NO_METADATA = z.strictObject({});

/** General relation between two assets, for links no module has a more specific meaning for. */
export const RELATED_TO_RELATION: AssetRelationDefinition = {
  type: "RELATED_TO",
  sourceTypes: "ANY",
  targetTypes: "ANY",
  metadataSchema: NO_METADATA,
  playerVisible: true,
};

/** The relations known to the application; modules add theirs during registration. */
export class AssetRelationRegistry {
  private readonly definitions = new Map<string, AssetRelationDefinition>();

  register(definition: AssetRelationDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Asset relation '${definition.type}' is already registered`);
    }

    this.definitions.set(definition.type, definition);
  }

  find(type: string): AssetRelationDefinition | undefined {
    return this.definitions.get(type);
  }

  require(type: string): AssetRelationDefinition {
    const definition = this.find(type);

    if (!definition) {
      throw new ValidationError("Unknown relation type", { relationType: type });
    }

    return definition;
  }

  list(): readonly AssetRelationDefinition[] {
    return [...this.definitions.values()];
  }

  listBlockingTypes(): string[] {
    return this.list()
      .filter((definition) => definition.blocksTargetArchive)
      .map((definition) => definition.type);
  }

  parseMetadata(type: string, metadata: unknown): Record<string, unknown> {
    const result = this.require(type).metadataSchema.safeParse(metadata);

    if (!result.success) {
      throw new ValidationError("Metadata does not match the relation", result.error.issues);
    }

    return result.data;
  }

  assertEndpoints(
    type: string,
    source: { id: string; assetType: AssetType },
    target: { id: string; assetType: AssetType },
  ): void {
    const definition = this.require(type);

    if (source.id === target.id && !definition.allowSelfLink) {
      throw new ValidationError("An asset cannot be linked to itself with this relation");
    }

    if (!includesType(definition.sourceTypes, source.assetType)) {
      throw new ValidationError("This relation cannot start at this asset type", {
        relationType: type,
        assetType: source.assetType,
      });
    }

    if (!includesType(definition.targetTypes, target.assetType)) {
      throw new ValidationError("This relation cannot point to this asset type", {
        relationType: type,
        assetType: target.assetType,
      });
    }
  }
}

function includesType(allowed: readonly AssetType[] | "ANY", assetType: AssetType): boolean {
  return allowed === "ANY" || allowed.includes(assetType);
}
