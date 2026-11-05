import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import { CONTENT_SHARE_AUDIENCES } from "#src/modules/content-shares/domain/entities/ContentSharesTable";

/**
 * All share fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const ContentShareBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  assetId: uuidDto,
  audience: z.enum(CONTENT_SHARE_AUDIENCES),
  /** Active player memberships of the campaign; only for `SELECTED_PLAYERS`. */
  recipientMemberIds: z
    .array(uuidDto)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Recipients must be unique" }),
  sharedAt: isoDateTimeDto,
  /** Null shares until it is revoked. */
  expiresAt: isoDateTimeDto.nullable(),
});

export type ContentShareBaseDto = z.infer<typeof ContentShareBaseSchema>;

type AudienceInput = {
  audience?: ContentShareBaseDto["audience"] | undefined;
  recipientMemberIds?: string[] | undefined;
};

/** All players need no list, selected players need at least one. */
export function audienceMatchesRecipients(value: AudienceInput): boolean {
  const count = value.recipientMemberIds?.length ?? 0;

  return value.audience === "SELECTED_PLAYERS" ? count > 0 : count === 0;
}
