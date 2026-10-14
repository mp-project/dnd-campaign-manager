import { z } from "zod";

export const CampaignMembershipPermissionsResponseSchema = z.strictObject({
  permissions: z.array(z.string().min(1)),
});