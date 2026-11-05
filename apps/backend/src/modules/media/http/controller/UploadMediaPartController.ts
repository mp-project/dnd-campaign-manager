import type { Readable } from "node:stream";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestMediaUploadPartParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { UploadMediaPartUseCase } from "#src/modules/media/useCase/UploadMediaPartUseCase";

export class UploadMediaPartController extends AbstractController {
  constructor(private readonly useCase: UploadMediaPartUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    /** The content type parser of the module passes the body on unread. */
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestMediaUploadPartParamsSchema.parse(request.params);
      const length = Number(request.headers["content-length"]);

      return this.useCase.execute(request.requestContext, {
        ...params,
        contentLength: Number.isInteger(length) ? length : null,
        stream: request.body as Readable,
      });
    });
}
