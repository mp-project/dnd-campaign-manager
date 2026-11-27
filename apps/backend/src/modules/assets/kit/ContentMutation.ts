import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ContentTypes, ContentWriter } from "#src/modules/assets/kit/ContentWriter";

/**
 * A write of content on assets through its `ContentWriter`. Every write checks the same rule
 * (global content administrators, campaign content the game master and editors), in the
 * transaction of the action.
 */
export abstract class ContentMutation<
  T extends ContentTypes,
  Input extends { campaignId: string | null },
  Output,
> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly writer: ContentWriter<T>,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.writer.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}
