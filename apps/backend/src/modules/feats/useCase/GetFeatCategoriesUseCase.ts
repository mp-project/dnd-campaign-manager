import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResponseFeatCategoriesDto } from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

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
