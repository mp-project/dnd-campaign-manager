import type { AppDatabase } from "#core/db/pool";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import { type CampaignAssetViewer, slugify } from "#src/modules/assets/index";
import type { CreateSpeciesVariantDto } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import type { UpdateSpeciesVariantDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type {
  SpeciesVariantRecord,
  SpeciesVariantWithAsset,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import { parseVariantGrants } from "#src/modules/species/history/TrackedSpecies";
import {
  type CatalogAccess,
  rowFields,
  type SpeciesService,
} from "#src/modules/species/service/SpeciesService";

/**
 * Variants of a species (subraces, lineages, legacies, ancestries). Each is an asset of type
 * `SPECIES_VARIANT` in the scope of its species, with its own status, release and history; the
 * rules against the species live in `SpeciesService`.
 */
export class SpeciesVariantsService {
  constructor(private readonly speciesService: SpeciesService) {}

  get db(): AppDatabase {
    return this.speciesService.db;
  }

  /** A variant of this species; variants of other species are 404. */
  async requireVariantOf(
    db: AppDatabase,
    speciesId: string,
    variantId: string,
  ): Promise<SpeciesVariantWithAsset> {
    const found = await this.speciesService.repository.findVariantById(db, variantId);

    if (!found || found.variant.speciesId !== speciesId) {
      throw new NotFoundError("Variant not found");
    }

    return found;
  }

  /**
   * Variants of a species a viewer may see in the campaign: available like the species itself (see
   * `SpeciesService.isAvailableInCatalog`). GMs managing their own species also see archived ones.
   * Callers inside a transaction pass its handle as `db`.
   */
  async listAvailable(
    viewer: CampaignAssetViewer & { isAdmin: boolean },
    speciesId: string,
    access: CatalogAccess,
    db: AppDatabase = this.db,
  ): Promise<SpeciesVariantWithAsset[]> {
    const variants = await this.speciesService.repository.listVariants(db, speciesId);
    const available = await this.speciesService.filterAvailableInCatalog(
      viewer,
      variants.map(({ asset }) => asset),
      access,
      db,
    );

    return variants.filter(({ asset }) => available.has(asset.id));
  }

  /** Variants of a global species outside a campaign: all for administrators, else active ones. */
  async listSystem(
    speciesId: string,
    isAdmin: boolean,
    db: AppDatabase = this.db,
  ): Promise<SpeciesVariantWithAsset[]> {
    const variants = await this.speciesService.repository.listVariants(db, speciesId);

    return isAdmin ? variants : variants.filter(({ asset }) => asset.status === "ACTIVE");
  }

  async loadRecords(
    db: AppDatabase,
    items: readonly SpeciesVariantWithAsset[],
  ): Promise<SpeciesVariantRecord[]> {
    const rulesetIds = await this.speciesService.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  async loadRecord(db: AppDatabase, found: SpeciesVariantWithAsset): Promise<SpeciesVariantRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as SpeciesVariantRecord;
  }

  /**
   * Asset and variant in the transaction of the action. Without a ruleset policy the variant takes
   * that of its species, so it is offered wherever the species is.
   */
  async createVariant(
    scope: ActionScope,
    params: { actorId: string; species: SpeciesWithAsset },
    input: CreateSpeciesVariantDto,
  ): Promise<SpeciesVariantRecord> {
    const { species: base, asset: baseAsset } = params.species;

    if (baseAsset.status === "ARCHIVED") {
      throw new ConflictError("Archived species get no new variants", { speciesId: base.id });
    }

    const inherit = input.rulesetPolicy === undefined;
    const speciesRulesets =
      inherit && base.campaignId === null && baseAsset.rulesetPolicy === "RESTRICTED"
        ? ((await this.speciesService.assets.ownRulesets(scope.tx, baseAsset.id)) ?? [])
        : undefined;
    const rulesetIds = input.rulesetIds ?? speciesRulesets;
    const code =
      input.code ?? slugify(input.name, { fallback: "variant" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.speciesService.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: base.campaignId },
      {
        assetType: "SPECIES_VARIANT",
        title: input.name,
        slug: slugify(input.name, { unique: true, fallback: "variant" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy ?? baseAsset.rulesetPolicy,
        ...(rulesetIds !== undefined ? { rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const row = {
      campaignId: base.campaignId,
      assetId: asset.id,
      speciesId: base.id,
      variantGroupCode: input.variantGroupCode,
      code,
      description: input.description ?? null,
      displayOrder: input.displayOrder,
      featureGrants: input.featureGrants,
    };

    // Creating runs no history guard, so the rules are checked here.
    await this.speciesService.assertVariantValid(scope.tx, row);

    const created = await this.speciesService.withConstraintErrors(() =>
      scope.create(this.speciesService.trackedVariant, row),
    );

    return this.loadRecord(scope.tx, await this.requireVariantOf(scope.tx, base.id, created.id));
  }

  /** Asset fields first, then the variant; like `SpeciesService.updateSpecies`. */
  async updateVariant(
    scope: ActionScope,
    params: { found: SpeciesVariantWithAsset; actorId: string; command: UpdateSpeciesVariantDto },
  ): Promise<{ record: SpeciesVariantRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { variant, asset } = params.found;

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived variants cannot be modified", { assetId: asset.id });
    }

    const merged = await this.speciesService.updateAssetFields(scope, {
      assetId: asset.id,
      expectedAssetVersion,
      actorId: params.actorId,
      fields,
    });
    const set = rowFields(fields);
    let changed = false;

    if (Object.keys(set).length > 0) {
      const result = await this.speciesService.withConstraintErrors(() =>
        scope.change(this.speciesService.trackedVariant, variant.id, () => ({
          set,
          baseVersion: expectedVersion,
        })),
      );

      changed = result.changed;
      merged.push(...result.merged);
    }

    const found = await this.requireVariantOf(scope.tx, variant.speciesId, variant.id);

    if (!changed && (fields.rulesetIds !== undefined || fields.rulesetPolicy !== undefined)) {
      await this.speciesService.assertVariantValid(scope.tx, {
        ...found.variant,
        featureGrants: parseVariantGrants(found.variant),
      });
    }

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  async archiveVariant(
    scope: ActionScope,
    params: { found: SpeciesVariantWithAsset; expectedAssetVersion: number },
  ): Promise<SpeciesVariantRecord> {
    await this.speciesService.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(
      scope.tx,
      await this.requireVariantOf(scope.tx, params.found.variant.speciesId, params.found.variant.id),
    );
  }

  /** The species must not be archived; checked by `SpeciesService.assertReactivatable`. */
  async restoreVariant(
    scope: ActionScope,
    params: { found: SpeciesVariantWithAsset; expectedAssetVersion: number },
  ): Promise<SpeciesVariantRecord> {
    await this.speciesService.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(
      scope.tx,
      await this.requireVariantOf(scope.tx, params.found.variant.speciesId, params.found.variant.id),
    );
  }
}
