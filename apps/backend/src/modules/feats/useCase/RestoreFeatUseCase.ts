import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatLifecycleCommandDto } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

export type RestoreFeatInput = {
  campaignId: string | null;
  featId: string;
  command: FeatLifecycleCommandDto;
};

/** Restores an archived feat, including a release it had; checked again at the end. */
export class RestoreFeatUseCase extends MutationUseCase<RestoreFeatInput, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreFeatInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreFeatInput,
  ): Promise<ResponseFeatFullDto> {
    const found = await this.featsService.requireForWrite(scope.tx, input);

    return toFeatFullResponse(
      await this.featsService.restoreFeat(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
