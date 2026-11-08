import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateFeatureDto } from "#src/modules/features/domain/dto/CreateFeatureDto";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/** `campaignId` null creates a global feature, which only administrators may do. */
export type CreateFeatureInput = { campaignId: string | null; command: CreateFeatureDto };

export class CreateFeatureUseCase extends MutationUseCase<CreateFeatureInput, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly featuresService: FeaturesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateFeatureInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featuresService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateFeatureInput,
  ): Promise<ResponseFeatureFullDto> {
    const actorId = this.featuresService.actorIdOf(context);

    return toFeatureFullResponse(
      await this.featuresService.createFeature(
        scope,
        { actorId, campaignId: input.campaignId },
        input.command,
      ),
    );
  }
}
