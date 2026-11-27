import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { ContentMutation } from "#src/modules/assets/kit/ContentMutation";
import type { ContentTypes } from "#src/modules/assets/kit/ContentWriter";

export type ArchiveContentInput<T extends ContentTypes> = T["path"] & {
  command: { expectedAssetVersion: number };
};

/** Archives content; it can be restored. The kernel refuses it while other content needs it. */
export abstract class ArchiveContentUseCase<T extends ContentTypes, Response> extends ContentMutation<
  T,
  ArchiveContentInput<T>,
  Response
> {
  protected abstract readonly toResponse: (record: T["record"]) => Response;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ArchiveContentInput<T>,
  ): Promise<Response> {
    const found = await this.writer.requireForWrite(scope.tx, input);

    return this.toResponse(
      await this.writer.archive(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
