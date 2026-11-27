import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { ContentMutation } from "#src/modules/assets/kit/ContentMutation";
import type { ContentTypes } from "#src/modules/assets/kit/ContentWriter";

export type RestoreContentInput<T extends ContentTypes> = T["path"] & {
  command: { expectedAssetVersion: number };
};

/** Restores archived content with the status it had before; it is checked again at the end of the action. */
export abstract class RestoreContentUseCase<T extends ContentTypes, Response> extends ContentMutation<
  T,
  RestoreContentInput<T>,
  Response
> {
  protected abstract readonly toResponse: (record: T["record"]) => Response;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreContentInput<T>,
  ): Promise<Response> {
    const found = await this.writer.requireForWrite(scope.tx, input);

    return this.toResponse(
      await this.writer.restore(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
