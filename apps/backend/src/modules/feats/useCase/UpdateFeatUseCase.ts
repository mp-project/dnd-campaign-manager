import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateFeatDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { UpdateFeatDto } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

export type UpdateFeatInput = { campaignId: string | null; featId: string; command: UpdateFeatDto };

export class UpdateFeatUseCase extends MutationUseCase<UpdateFeatInput, ResponseUpdateFeatDto> {
  protected readonly action = FEAT_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateFeatInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateFeatInput,
  ): Promise<ResponseUpdateFeatDto> {
    const actorId = this.featsService.actorIdOf(context);
    const found = await this.featsService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.featsService.updateFeat(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toFeatFullResponse(record), merged };
  }
}
