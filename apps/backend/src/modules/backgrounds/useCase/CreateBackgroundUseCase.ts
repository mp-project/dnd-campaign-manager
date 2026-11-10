import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateBackgroundDto } from "#src/modules/backgrounds/domain/dto/CreateBackgroundDto";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/** `campaignId` null creates a global background, which only administrators may do. */
export type CreateBackgroundInput = { campaignId: string | null; command: CreateBackgroundDto };

export class CreateBackgroundUseCase extends MutationUseCase<CreateBackgroundInput, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly backgroundsService: BackgroundsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateBackgroundInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.backgroundsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateBackgroundInput,
  ): Promise<ResponseBackgroundFullDto> {
    const actorId = this.backgroundsService.actorIdOf(context);

    return toBackgroundFullResponse(
      await this.backgroundsService.createBackground(
        scope,
        { actorId, campaignId: input.campaignId },
        input.command,
      ),
    );
  }
}
