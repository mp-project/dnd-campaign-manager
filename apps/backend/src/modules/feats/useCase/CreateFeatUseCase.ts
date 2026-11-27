import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateFeatDto } from "#src/modules/feats/domain/dto/CreateFeatDto";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/** `campaignId` null creates a global feat, which only administrators may do. */
export type CreateFeatInput = { campaignId: string | null; command: CreateFeatDto };

export class CreateFeatUseCase extends MutationUseCase<CreateFeatInput, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateFeatInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateFeatInput,
  ): Promise<ResponseFeatFullDto> {
    const actorId = this.featsService.actorIdOf(context);

    return toFeatFullResponse(
      await this.featsService.createFeat(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}
