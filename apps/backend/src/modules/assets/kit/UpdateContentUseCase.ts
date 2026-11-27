import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { ContentMutation } from "#src/modules/assets/kit/ContentMutation";
import type { ContentTypes } from "#src/modules/assets/kit/ContentWriter";

export type UpdateContentInput<T extends ContentTypes> = T["path"] & { command: T["update"] };

/**
 * Changes content and its asset fields in one action. The answer is the module's full view plus
 * `merged`, the fields that kept a newer value from somebody else.
 */
export abstract class UpdateContentUseCase<T extends ContentTypes, Response> extends ContentMutation<
  T,
  UpdateContentInput<T>,
  Response & { merged: string[] }
> {
  protected abstract readonly toResponse: (record: T["record"]) => Response;

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateContentInput<T>,
  ): Promise<Response & { merged: string[] }> {
    const actorId = this.writer.actorIdOf(context);
    const found = await this.writer.requireForWrite(scope.tx, input);
    const { record, merged } = await this.writer.update(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...this.toResponse(record), merged };
  }
}
