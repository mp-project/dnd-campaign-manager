import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { DeleteCampaignUseCase } from "#src/modules/campaigns/useCase/DeleteCampaignUseCase";

export class DeleteCampaignController extends AbstractController {
  constructor(
    private readonly deleteCampaignUseCase: DeleteCampaignUseCase,
    private readonly campaignUserService: CampaignUserService,
  ) {
    super();
  }

  handle = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) =>
    this.execute(async () => {
      await this.campaignUserService.requireUser(request.requestContext);
      const params = RequestCampaignParamsSchema.parse(request.params);
      await this.deleteCampaignUseCase.execute(request.requestContext, params.campaignId);

      return reply.code(204).send();
    });
}
