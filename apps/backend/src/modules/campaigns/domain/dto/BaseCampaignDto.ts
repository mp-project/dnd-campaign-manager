import { z } from "zod";

export const CampaignStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const CampaignTimeEventTypeSchema = z.enum([
  "ADVANCE_DAYS",
  "LONG_REST",
  "CORRECTION",
]);

export const CampaignSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CampaignSettingsSchema = z.record(z.string(), z.unknown());

export const CampaignDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .nullable();

export const CampaignNameSchema = z.string().trim().min(1).max(160);
