import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import type { AssetRow, ContentAccess } from "#src/modules/assets/index";
import type { DefinitionIssue } from "#src/modules/backgrounds/domain/BackgroundDefinition";
import type {
  BackgroundDefinition,
  BackgroundFeatureGrant,
  EquipmentEntry,
  FeatGrant,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { ResolveBackgroundDto } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type {
  ResponseBackgroundFeatOptionsDto,
  ResponseBackgroundResolutionDto,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import {
  type BackgroundConflict,
  type BackgroundSelection,
  canTakeFeatAgain,
  type FeatRepeatability,
  validateBackgroundSelection,
} from "#src/modules/backgrounds/domain/BackgroundSelection";
import type { BackgroundWithAsset } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import { tryParseBackgroundDefinition } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";
import type { FeatWithAsset } from "#src/modules/feats/index";
import {
  type ActorSnapshot,
  type ResolvedFeatureGraph,
  toResolvedFeatureResponse,
} from "#src/modules/features/index";

type Header = "backgroundId" | "assetId" | "view";

/** Most feats listed per category of a choice; far more than any real catalog. */
const FEAT_OPTION_LIMIT = 200;

function countOccurrences(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

/** The stored repeatability of a feat, read without parsing its whole definition. */
function repeatabilityOf(feat: { repeatability: unknown }): FeatRepeatability | null {
  const value = feat.repeatability as { mode?: unknown; maximumOccurrences?: unknown } | null;

  return typeof value?.mode === "string"
    ? {
        mode: value.mode,
        maximumOccurrences: typeof value.maximumOccurrences === "number" ? value.maximumOccurrences : null,
      }
    : null;
}

/** Context values a CONTEXT binding may take, from the actor snapshot. */
function contextValue(key: string, actor: ActorSnapshot): number | undefined {
  if (key === "level.character" || key === "level.source") {
    return actor.characterLevel;
  }

  if (key === "proficiencyBonus") {
    return actor.proficiencyBonus;
  }

  const ability = /^ability\.([a-z]{3})(\.modifier)?$/.exec(key);

  if (ability) {
    const score = actor.abilities?.[ability[1] as keyof NonNullable<ActorSnapshot["abilities"]>];

    if (score === undefined) {
      return undefined;
    }

    return ability[2] ? Math.floor((score - 10) / 2) : score;
  }

  return undefined;
}

/** Parameter values of a grant: fixed ones and those taken from the actor. */
function bindingParameters(grant: BackgroundFeatureGrant, actor: ActorSnapshot): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  for (const binding of grant.bindings) {
    if (binding.bindingSource === "STATIC") {
      parameters[binding.parameterKey] = binding.staticValue;
    } else {
      const value = contextValue(binding.contextKey ?? "", actor);

      if (value !== undefined) {
        parameters[binding.parameterKey] = value;
      }
    }
  }

  return parameters;
}

/** Whether an item fits a choice entry: every constraint the filter sets must hold. */
function fitsEquipmentFilter(
  filter: NonNullable<EquipmentEntry["choiceFilter"]>,
  assetId: string,
  item: { category: string; toolCategory: string | null },
): boolean {
  return (
    (filter.itemAssetIds.length === 0 || filter.itemAssetIds.includes(assetId)) &&
    (filter.categories.length === 0 || filter.categories.includes(item.category as never)) &&
    (filter.toolCategories.length === 0 ||
      (item.toolCategory !== null && filter.toolCategories.includes(item.toolCategory as never)))
  );
}

/**
 * The preview of a background for a character, for the catalog route and the character modules:
 * checks the choices and computes what the background gives, with every value naming its source.
 * Changes nothing: the character modules store the assignment, item instances, wallet and
 * proficiencies in their own transaction, from this result.
 *
 * `isVisible` and the definition passed in decide what the viewer sees. Players get a preview of
 * the background as if hidden content did not exist; the character modules resolve with
 * everything visible.
 */
export class BackgroundSelectionService {
  constructor(private readonly backgrounds: BackgroundsService) {}

  async resolveBackground(
    found: BackgroundWithAsset,
    input: {
      access: ContentAccess;
      /** The definition as the viewer may see it. */
      definition: BackgroundDefinition;
      command: ResolveBackgroundDto;
      db?: AppDatabase | undefined;
    },
  ): Promise<Omit<ResponseBackgroundResolutionDto, Header>> {
    const db = input.db ?? this.backgrounds.db;
    const { command, access, definition } = input;
    const selection = validateBackgroundSelection(
      { customizationMode: found.background.customizationMode, definition },
      command,
    );
    const issues = [...selection.issues];

    if (found.asset.status !== "ACTIVE") {
      issues.unshift({ path: [], message: "Only active backgrounds can be chosen" });
    }

    const conflicts: BackgroundConflict[] = [...selection.conflicts];
    const featureSource = await this.featureSource(found, input, issues);
    const featRows = await this.checkFeats(selection, definition, access, db, { issues, conflicts }, command);

    await this.checkItems(selection, access, db, issues);

    if (issues.length > 0) {
      throw new ConflictError("Background choices are invalid", { issues });
    }

    const actor: ActorSnapshot = {
      ...command.actor,
      characterLevel: command.characterLevel,
      sourceLevel: command.characterLevel,
    };
    const features = await this.resolveFeatures(featureSource.grants, access, command, actor, db);

    return {
      sourceAssetId: found.asset.id,
      selectionMode: selection.selectionMode,
      characterLevel: command.characterLevel,
      abilityIncreases: selection.abilityIncreases,
      proficiencies: selection.proficiencies,
      feats: selection.feats.map((feat) => ({
        ...feat,
        featId: featRows.get(feat.featAssetId) as string,
      })),
      features: features.grants.map((grant) => ({ ...grant, sourceAssetId: featureSource.assetId })),
      totals: features.totals,
      equipment: selection.equipment && {
        optionCode: selection.equipment.optionCode,
        items: selection.equipment.items.map(({ entryKey, itemAssetId, quantity }) => ({
          entryKey,
          itemAssetId,
          quantity,
        })),
        walletDelta: selection.equipment.currency,
      },
      prompts: selection.prompts.map((prompt) => ({
        ...prompt,
        promptType: prompt.promptType as ResponseBackgroundResolutionDto["prompts"][number]["promptType"],
      })),
      conflicts,
    };
  }

  /**
   * The feats each feat grant offers a character that already has `existingFeatAssetIds`: for a
   * choice the active feats the campaign may use that fit the grant and that the character may
   * still take, counting the background's fixed feats as taken; for a fixed grant its feat, marked
   * unavailable if the character can't take it again. `definition` is as the viewer may see it.
   */
  async featOptions(input: {
    access: ContentAccess;
    definition: BackgroundDefinition;
    existingFeatAssetIds: readonly string[];
    db?: AppDatabase | undefined;
  }): Promise<ResponseBackgroundFeatOptionsDto["grants"]> {
    const db = input.db ?? this.backgrounds.db;
    const { feats } = this.backgrounds;
    const fixedIds = input.definition.featGrants.flatMap((grant) => (grant.featAssetId ? [grant.featAssetId] : []));
    const taken = countOccurrences([...input.existingFeatAssetIds, ...fixedIds]);
    const existing = countOccurrences(input.existingFeatAssetIds);
    const toOption = ({ feat, asset }: FeatWithAsset) => ({
      featAssetId: asset.id,
      featId: feat.id,
      name: asset.title,
      category: feat.category,
      repeatabilityMode: repeatabilityOf(feat)?.mode ?? "ONCE",
    });
    const fixedRows = await feats.repository.findByAssetIds(db, fixedIds);

    const result: ResponseBackgroundFeatOptionsDto["grants"] = [];

    for (const grant of input.definition.featGrants) {
      if (grant.featAssetId !== null) {
        const row = fixedRows.get(grant.featAssetId);

        result.push({
          grantKey: grant.key,
          selectionMode: "FIXED",
          options: row
            ? [{ ...toOption(row), available: canTakeFeatAgain(repeatabilityOf(row.feat), existing.get(row.asset.id) ?? 0) }]
            : [],
          truncated: false,
        });
        continue;
      }

      const filter = grant.optionFilter;

      if (!filter) {
        continue;
      }

      const { items, truncated } = await this.listCatalogFeats(input.access, filter, db);

      result.push({
        grantKey: grant.key,
        selectionMode: "CHOOSE",
        options: items
          .filter((row) => canTakeFeatAgain(repeatabilityOf(row.feat), taken.get(row.asset.id) ?? 0))
          .map((row) => ({ ...toOption(row), available: true })),
        truncated,
      });
    }

    return result;
  }

  /** Active feats of the campaign catalog that fit a grant's filter, sorted by code. */
  private async listCatalogFeats(
    access: ContentAccess,
    filter: NonNullable<FeatGrant["optionFilter"]>,
    db: AppDatabase,
  ): Promise<{ items: FeatWithAsset[]; truncated: boolean }> {
    const { feats } = this.backgrounds;

    if (filter.featAssetIds.length > 0) {
      const rows = [...(await feats.repository.findByAssetIds(db, filter.featAssetIds)).values()].filter(
        (row) => row.asset.status === "ACTIVE" && filter.categories.includes(row.feat.category),
      );
      const readable = await access.readableIds("CATALOG", rows.map((row) => row.asset), db);

      return {
        items: rows.filter((row) => readable.has(row.asset.id)).sort((a, b) => a.feat.code.localeCompare(b.feat.code)),
        truncated: false,
      };
    }

    const items: FeatWithAsset[] = [];
    let truncated = false;

    for (const category of filter.categories) {
      const page = await feats.repository.listPage(db, {
        limit: FEAT_OPTION_LIMIT,
        category,
        where: access.listWhere("CATALOG", { scope: undefined, status: "ACTIVE" }),
      });

      items.push(...page.items.filter((row) => row.asset.status === "ACTIVE"));
      truncated ||= page.hasMore;
    }

    return { items: items.sort((a, b) => a.feat.code.localeCompare(b.feat.code)), truncated };
  }

  /**
   * Whose features the character gets: the background's own, or with the 2014 customization those
   * of another background the campaign may use (as the viewer may see them).
   */
  private async featureSource(
    found: BackgroundWithAsset,
    input: { access: ContentAccess; definition: BackgroundDefinition; command: ResolveBackgroundDto; db?: AppDatabase | undefined },
    issues: DefinitionIssue[],
  ): Promise<{ assetId: string; grants: readonly BackgroundFeatureGrant[] }> {
    const otherId = input.command.customization?.featureBackgroundAssetId ?? null;
    const own = { assetId: found.asset.id, grants: input.definition.featureGrants };
    const db = input.db ?? this.backgrounds.db;

    if (otherId === null || otherId === found.asset.id) {
      return own;
    }

    const path = ["customization", "featureBackgroundAssetId"];
    const other = (await this.backgrounds.repository.findByAssetIds(db, [otherId])).get(otherId);
    const readable = other ? await input.access.allows("CATALOG", other.asset, db) : false;

    if (!other || !readable) {
      issues.push({ path, message: "Background not found" });
      return own;
    }

    if (other.asset.status !== "ACTIVE") {
      issues.push({ path, message: "Only features of active backgrounds can be taken" });
      return own;
    }

    const definition = tryParseBackgroundDefinition(other.background);

    if (definition === null) {
      issues.push({ path, message: "The stored definition of that background is invalid" });
      return own;
    }

    const visible = input.access.isFullView
      ? definition
      : (await this.backgrounds.playerDefinition(db, definition, input.access)).definition;

    return { assetId: other.asset.id, grants: visible.featureGrants };
  }

  /**
   * Fixed and chosen feats: chosen ones must be feats the campaign may use, active, of a category
   * the grant offers and, if it names feats, one of them. Returns the feat row ids by asset id.
   */
  private async checkFeats(
    selection: BackgroundSelection,
    definition: BackgroundDefinition,
    access: ContentAccess,
    db: AppDatabase,
    report: { issues: DefinitionIssue[]; conflicts: BackgroundConflict[] },
    command: ResolveBackgroundDto,
  ): Promise<Map<string, string>> {
    const { issues } = report;
    const ids = selection.feats.map((feat) => feat.featAssetId);
    const rows = await this.backgrounds.feats.repository.findByAssetIds(db, ids);
    const readable = await access.readableIds("CATALOG", [...rows.values()].map(({ asset }) => asset), db);
    // Fixed feats first, so a choice that repeats one of them is the one refused.
    const ordered = [...selection.feats].sort((a, b) => Number(a.chosen) - Number(b.chosen));
    const taken = countOccurrences(command.existingFeatAssetIds);

    for (const feat of ordered) {
      const row = rows.get(feat.featAssetId);
      const times = taken.get(feat.featAssetId) ?? 0;

      taken.set(feat.featAssetId, times + 1);

      if (!row || canTakeFeatAgain(repeatabilityOf(row.feat), times)) {
        continue;
      }

      if (feat.chosen) {
        issues.push({
          path: ["featChoices", feat.grantKey],
          message: "The character has this feat already or takes it here twice, and it can't be taken again",
        });
      } else {
        // A fixed grant can't be chosen differently; the GM decides what the character gets instead.
        report.conflicts.push({
          code: "DUPLICATE_FEAT",
          proficiencyKey: null,
          featAssetId: feat.featAssetId,
          message: "The character has this feat already, and it can't be taken again",
        });
      }
    }

    for (const feat of selection.feats) {
      const path = ["featChoices", feat.grantKey];
      const row = rows.get(feat.featAssetId);
      const grant = definition.featGrants.find((item) => item.key === feat.grantKey);

      if (!row || !readable.has(feat.featAssetId)) {
        issues.push({ path, message: `'${feat.featAssetId}' is no feat of the campaign` });
        continue;
      }

      if (row.asset.status !== "ACTIVE") {
        issues.push({ path, message: "Only active feats can be taken" });
        continue;
      }

      const filter = grant?.optionFilter;

      if (feat.chosen && filter) {
        if (!filter.categories.includes(row.feat.category)) {
          issues.push({ path, message: `The grant offers ${filter.categories.join(" or ")} feats` });
        } else if (filter.featAssetIds.length > 0 && !filter.featAssetIds.includes(feat.featAssetId)) {
          issues.push({ path, message: "The grant does not offer this feat" });
        }
      }
    }

    return new Map([...rows].map(([assetId, row]) => [assetId, row.feat.id]));
  }

  /** Chosen tools and equipment items: items the campaign may use, active, fitting the choice. */
  private async checkItems(
    selection: BackgroundSelection,
    access: ContentAccess,
    db: AppDatabase,
    issues: DefinitionIssue[],
  ): Promise<void> {
    const tools = selection.proficiencies.filter((proficiency) => proficiency.assetId !== null);
    const equipment = selection.equipment?.items ?? [];
    const ids = [...tools.map((tool) => tool.assetId as string), ...equipment.map((item) => item.itemAssetId)];
    const rows = await this.backgrounds.items.repository.findByAssetIds(db, ids);
    const readable = await access.readableIds("CATALOG", [...rows.values()].map(({ asset }) => asset), db);
    const usable = (assetId: string): { category: string; toolCategory: string | null; asset: AssetRow } | null => {
      const row = rows.get(assetId);

      return row && readable.has(assetId) && row.asset.status === "ACTIVE"
        ? { category: row.item.category, toolCategory: row.item.toolCategory, asset: row.asset }
        : null;
    };

    for (const tool of tools) {
      const item = usable(tool.assetId as string);
      const path = tool.grantKey === null ? ["customization"] : ["proficiencyChoices", tool.grantKey];

      if (!item || item.category !== "TOOL") {
        issues.push({ path, message: `'${tool.assetId}' is no tool the campaign may use` });
      }
    }

    for (const entry of equipment) {
      const path = ["equipmentChoice", "itemChoices", entry.entryKey];
      const item = usable(entry.itemAssetId);

      if (entry.choiceFilter === null) {
        // Fixed items come from the definition, which the content check keeps valid.
        continue;
      }

      if (!item) {
        issues.push({ path, message: `'${entry.itemAssetId}' is no item the campaign may use` });
      } else if (!fitsEquipmentFilter(entry.choiceFilter, entry.itemAssetId, item)) {
        issues.push({ path, message: "The item does not fit the choice" });
      }
    }
  }

  /** Every grant resolved with its parameters and choices bound, and the passive effects added up. */
  private async resolveFeatures(
    grants: readonly BackgroundFeatureGrant[],
    access: ContentAccess,
    command: ResolveBackgroundDto,
    actor: ActorSnapshot,
    db: AppDatabase,
  ): Promise<Pick<ResponseBackgroundResolutionDto, "totals"> & {
    grants: Omit<ResponseBackgroundResolutionDto["features"][number], "sourceAssetId">[];
  }> {
    const { features } = this.backgrounds;
    const featureRows = await features.repository.findByAssetIds(
      db,
      grants.map((grant) => grant.featureAssetId),
    );
    const resolvedByIndex = new Map<number, ResolvedFeatureGraph>();

    for (const [index, grant] of grants.entries()) {
      const feature = featureRows.get(grant.featureAssetId);

      if (!feature) {
        continue;
      }

      resolvedByIndex.set(
        index,
        await features.resolveFeature(feature, {
          access,
          bindings: {
            parameters: bindingParameters(grant, actor),
            choices: Object.fromEntries(
              command.featureChoices
                .filter((choice) => choice.grantKey === grant.key)
                .map((choice) => [choice.choiceKey, [...choice.values]]),
            ),
          },
          actor,
          db,
        }),
      );
    }

    const resolved = [...resolvedByIndex.entries()];
    const evaluated = features.evaluateEffects(
      resolved.map(([index, graph]) => ({
        found: featureRows.get(grants[index]?.featureAssetId as string) as NonNullable<
          ReturnType<typeof featureRows.get>
        >,
        resolved: graph,
      })),
    );
    const evaluatedStatus = new Map(
      evaluated.instances.map((instance) => [resolved[instance.index]?.[0], instance.status]),
    );

    return {
      grants: grants.map((grant, index) => {
        const graph = resolvedByIndex.get(index);
        const feature = featureRows.get(grant.featureAssetId);

        return {
          key: grant.key,
          featureAssetId: grant.featureAssetId,
          operation: grant.operation,
          targetFeatureAssetId: grant.targetFeatureAssetId,
          status: evaluatedStatus.get(index) ?? "APPLIED",
          resolved: graph && feature ? toResolvedFeatureResponse(feature, access.viewer.rulesetId, graph) : null,
        };
      }),
      totals: evaluated.totals,
    };
  }
}
