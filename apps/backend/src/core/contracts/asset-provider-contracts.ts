import { z } from "zod";

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
