import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateFeatureDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type { UpdateFeatureDto } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

export type UpdateFeatureInput = {
  campaignId: string | null;
  featureId: string;
  command: UpdateFeatureDto;
};

export class UpdateFeatureUseCase extends MutationUseCase<
  UpdateFeatureInput,
  ResponseUpdateFeatureDto
> {
  protected readonly action = FEATURE_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly featuresService: FeaturesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateFeatureInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featuresService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateFeatureInput,
  ): Promise<ResponseUpdateFeatureDto> {
    const actorId = this.featuresService.actorIdOf(context);
    const found = await this.featuresService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.featuresService.updateFeature(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toFeatureFullResponse(record), merged };
  }
}
