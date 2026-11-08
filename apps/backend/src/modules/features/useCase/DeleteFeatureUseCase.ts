import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type { FeatureLifecycleCommandDto } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

export type DeleteFeatureInput = {
  campaignId: string | null;
  featureId: string;
  command: FeatureLifecycleCommandDto;
};

/** Archives the feature; it can be restored. Fails while other definitions refer to it. */
export class DeleteFeatureUseCase extends MutationUseCase<DeleteFeatureInput, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly featuresService: FeaturesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteFeatureInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featuresService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteFeatureInput,
  ): Promise<ResponseFeatureFullDto> {
    const found = await this.featuresService.requireForWrite(scope.tx, input);

    return toFeatureFullResponse(
      await this.featuresService.archiveFeature(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
