import type { RequestContext } from "#core/http/requestContext";
import { createStandardListResponse } from "#core/http/listResponse";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateCampaignInvitationSchema } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  AcceptCampaignInvitationSchema,
  CampaignInvitationLookupQuerySchema,
  CampaignInvitationItemParamsSchema,
  CampaignInvitationParamsSchema,
} from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

function toInvitationResponse(invitation: {
  id: string;
  email: string;
  userTag: string | null;
  role: "EDITOR" | "PLAYER";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
}) {
  return {
    id: invitation.id,
    email: invitation.email,
    userTag: invitation.userTag,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export class CampaignInvitationsController extends AbstractController {
  constructor(private readonly invitationsService: CampaignInvitationsService) {
    super();
  }

  create = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = CampaignInvitationParamsSchema.parse(request.params);
      const input = CreateCampaignInvitationSchema.parse(request.body);
      const invitation = await this.invitationsService.invite(
        request.requestContext,
        campaignId,
        input,
      );

      return toInvitationResponse(invitation);
    });

  list = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = CampaignInvitationParamsSchema.parse(request.params);
      const invitations = await this.invitationsService.listPending(
        request.requestContext,
        campaignId,
      );

      const data = invitations.map(toInvitationResponse);

      return createStandardListResponse({
        data,
        limit: Math.max(data.length, 1),
        nextCursor: null,
        total: data.length,
      });
    });

  lookupUserTag = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = CampaignInvitationParamsSchema.parse(request.params);
      const { userTag } = CampaignInvitationLookupQuerySchema.parse(request.query);
      return this.invitationsService.lookupUserTag(
        request.requestContext,
        campaignId,
        userTag,
      );
    });

  revoke = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  ) =>
    this.execute(async () => {
      const { campaignId, invitationId } = CampaignInvitationItemParamsSchema.parse(
        request.params,
      );
      await this.invitationsService.revoke(
        request.requestContext,
        campaignId,
        invitationId,
      );
      return reply.code(204).send();
    });

  accept = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { token } = AcceptCampaignInvitationSchema.parse(request.body);
      return this.invitationsService.accept(request.requestContext, token);
    });

  listForCurrentUser = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => ({
      data: await this.invitationsService.listForCurrentUser(request.requestContext),
    }));
}