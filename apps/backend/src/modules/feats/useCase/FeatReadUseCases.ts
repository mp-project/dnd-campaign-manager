import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import type { EligibilityCheckDto, ResolveFeatDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import {
  type ResponseFeatCategoriesDto,
  type ResponseFeatChoicesDto,
  type ResponseFeatDto,
  type ResponseFeatEligibilityDto,
  type ResponseFeatFeaturesDto,
  type ResponseFeatPrerequisitesDto,
  type ResponseFeatResolutionDto,
  toFeatFullResponse,
  toFeatPlayerResponse,
  toPlayerDefinition,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatSelectionService } from "#src/modules/feats/service/FeatSelectionService";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";
import type { FeatReader, FeatReadMode, ReadableFeat } from "#src/modules/feats/useCase/FeatReader";

type FeatInput = { campaignId?: string | undefined; featId: string };
type CatalogInput = { campaignId: string; featId: string };

const header = (readable: ReadableFeat) => ({
  featId: readable.found.feat.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

/** The whole feat; the view depends on who reads it, see `FeatReader`. */
export class GetFeatUseCase {
  constructor(
    private readonly featsService: FeatsService,
    private readonly reader: FeatReader,
    private readonly mode: FeatReadMode,
  ) {}

  async execute(context: RequestContext, input: FeatInput): Promise<ResponseFeatDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toFeatFullResponse(await this.featsService.loadRecord(this.featsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toFeatPlayerResponse(readable.found, definition, isVisible);
  }
}

/** Minimum level, check mode and the prerequisite tree. */
export class GetFeatPrerequisitesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseFeatPrerequisitesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return {
      ...header(readable),
      minimumCharacterLevel: readable.found.feat.minimumCharacterLevel,
      prerequisiteCheckMode: readable.found.feat.prerequisiteCheckMode,
      prerequisites: toPlayerDefinition(definition, isVisible).prerequisites,
    };
  }
}

/** Repeatability and the choices the character makes when taking the feat. */
export class GetFeatChoicesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseFeatChoicesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);
    const view = toPlayerDefinition(definition, isVisible);

    return { ...header(readable), repeatability: view.repeatability, choices: view.choices };
  }
}

/** The features the feat grants, upgrades or replaces. */
export class GetFeatFeaturesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseFeatFeaturesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return { ...header(readable), grants: toPlayerDefinition(definition, isVisible).featureGrants };
  }
}

/**
 * Whether a character described by a snapshot may take the feat. Everybody who may see the feat in
 * the campaign may ask, players included; nothing is stored.
 */
export class CheckFeatEligibilityUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly selection: FeatSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: CatalogInput & { command: EligibilityCheckDto },
  ): Promise<ResponseFeatEligibilityDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return {
      ...header(readable),
      ...this.selection.checkEligibility(readable.found, definition, input.command, isVisible),
    };
  }
}

/** Checks choices and resolves the granted features; nothing is stored. */
export class ResolveFeatUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly selection: FeatSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: CatalogInput & { command: ResolveFeatDto },
  ): Promise<ResponseFeatResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    if (!readable.access) {
      throw new NotFoundError("Feat not found");
    }

    return {
      ...header(readable),
      ...(await this.selection.resolveFeat(readable.found, {
        access: readable.access,
        definition,
        isVisible,
        command: input.command,
      })),
    };
  }
}

/**
 * Where a feat is used in the current campaign: links and content that refers to it, such as
 * other feats that require it. Players only see usages whose other end they may see as well.
 * `ownOnly` limits it to custom feats, for the route under `/feats`.
 */
export class GetFeatUsagesUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly featsService: FeatsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Feat not found");
    }

    return this.featsService.getUsages(readable.access, readable.found.asset.id);
  }
}

/** The categories feats of the campaign ruleset may have; for pickers and editors. */
export class GetFeatCategoriesUseCase {
  constructor(
    private readonly featsService: FeatsService,
    private readonly assets: AssetsService,
  ) {}

  async execute(context: RequestContext, input: { campaignId: string }): Promise<ResponseFeatCategoriesDto> {
    // The access session refuses non-members (404) before anything about the campaign is read.
    await this.assets.access(context, input.campaignId);

    const result = await this.featsService.categoriesOf(input.campaignId);

    return { ...result, categories: [...result.categories] };
  }
}
