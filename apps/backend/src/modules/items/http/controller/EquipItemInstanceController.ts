import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { EquipItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { EquipItemInstanceUseCase } from "#src/modules/items/useCase/EquipItemInstanceUseCase";

export class EquipItemInstanceController extends AbstractController {
  constructor(private readonly useCase: EquipItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = EquipItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
