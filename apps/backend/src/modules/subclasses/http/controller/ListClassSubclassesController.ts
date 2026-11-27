import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCatalogClassSubclassesParamsSchema,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { ListClassSubclassesUseCase } from "#src/modules/subclasses/useCase/ListClassSubclassesUseCase";

export class ListClassSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListClassSubclassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.ok(await this.useCase.execute(
        request.requestContext,
        RequestCatalogClassSubclassesParamsSchema.parse(request.params),
      )),
    );
}
