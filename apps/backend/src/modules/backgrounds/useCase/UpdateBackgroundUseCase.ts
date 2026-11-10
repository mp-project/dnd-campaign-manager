import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateBackgroundDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { UpdateBackgroundDto } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

export type UpdateBackgroundInput = {
  campaignId: string | null;
  backgroundId: string;
  command: UpdateBackgroundDto;
};

export class UpdateBackgroundUseCase extends MutationUseCase<UpdateBackgroundInput, ResponseUpdateBackgroundDto> {
  protected readonly action = BACKGROUND_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly backgroundsService: BackgroundsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateBackgroundInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.backgroundsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateBackgroundInput,
  ): Promise<ResponseUpdateBackgroundDto> {
    const actorId = this.backgroundsService.actorIdOf(context);
    const found = await this.backgroundsService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.backgroundsService.updateBackground(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toBackgroundFullResponse(record), merged };
  }
}
