import { z } from "zod";

import { uuidDto } from "#core/http/dto";

const MAX_NAME_LENGTH = 80;

/**
 * The form in which names are compared: unicode forms unified, spacing collapsed and case folded.
 * Going through upper case also folds letters like "ß" and "ς" that plain lower case keeps apart.
 */
export function normalizeTagName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .toLowerCase()
    .normalize("NFC");
}

/**
 * All tag fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const TagBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .refine((name) => {
      const { length } = normalizeTagName(name);

      // Normalizing can make a name longer or, with invisible characters only, empty.
      return length > 0 && length <= MAX_NAME_LENGTH;
    }, "Name cannot be normalized to a valid length"),
  normalizedName: z.string().min(1).max(MAX_NAME_LENGTH),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/)
    .nullable(),
  description: z.string().trim().min(1).max(500).nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000),
});

export type TagBaseDto = z.infer<typeof TagBaseSchema>;
