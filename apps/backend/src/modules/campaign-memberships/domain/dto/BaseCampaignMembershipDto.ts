import { z } from "zod";

export const CampaignMembershipRoleSchema = z.enum(["EDITOR", "PLAYER"]);
export const CampaignMembershipStatusSchema = z.enum(["PENDING", "ACTIVE", "REVOKED"]);