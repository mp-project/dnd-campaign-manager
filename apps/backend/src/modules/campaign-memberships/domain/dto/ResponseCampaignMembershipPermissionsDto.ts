import { z } from "zod";

export const CampaignMembershipPermissionsResponseSchema = z.strictObject({
  permissions: z.array(z.string().min(1)),
});

export type CampaignMembershipPermissionsResponseDto = z.infer<
  typeof CampaignMembershipPermissionsResponseSchema
>;
