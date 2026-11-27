import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { ContentMutation } from "#src/modules/assets/kit/ContentMutation";
import type { ContentTypes } from "#src/modules/assets/kit/ContentWriter";

/** `campaignId` null creates global content, which only administrators may do. */
export type CreateContentInput<T extends ContentTypes> = {
  campaignId: string | null;
  command: T["create"];
};

/** Creates content with its asset in one action; the module names the action and the answer. */
export abstract class CreateContentUseCase<T extends ContentTypes, Response> extends ContentMutation<
  T,
  CreateContentInput<T>,
  Response
> {
  protected abstract readonly toResponse: (record: T["record"]) => Response;

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateContentInput<T>,
  ): Promise<Response> {
    const actorId = this.writer.actorIdOf(context);

    return this.toResponse(
      await this.writer.create(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}
