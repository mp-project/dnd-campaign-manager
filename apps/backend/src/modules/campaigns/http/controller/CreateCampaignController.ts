import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  CreateCampaignRequestSchema,
  CreateCampaignSchema,
} from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { CreateCampaignUseCase } from "#src/modules/campaigns/useCase/CreateCampaignUseCase";

export class CreateCampaignController extends AbstractController {
  constructor(
    private readonly createCampaignUseCase: CreateCampaignUseCase,
    private readonly campaignUserService: CampaignUserService,
  ) {
    super();
  }

  handle = async (
    request: { body: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) =>
    this.execute(async () => {
      const actor = await this.campaignUserService.requireUser(request.requestContext);

      const body = CreateCampaignRequestSchema.parse(request.body);
      const input = CreateCampaignSchema.parse({
        ...body,
        createdBy: actor.id,
      });
      const created = await this.createCampaignUseCase.execute(request.requestContext, input);

      return reply.code(201).send(toCampaignResponse(created));
    });
}
