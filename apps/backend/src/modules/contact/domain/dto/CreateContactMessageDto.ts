import { z } from "zod";

import { ContactMessageBaseSchema } from "#src/modules/contact/domain/dto/BaseContactMessageDto";
import { ContactChallengeSolutionSchema } from "#src/modules/contact/domain/dto/ContactChallengeDto";

/**
 * A message from the contact form. The privacy policy must be accepted, and `challenge` carries the
 * solved JS challenge (`GET /contact/challenge`). `website` is a field people never see (a
 * honeypot): a form that fills it was sent by a bot, and the message is accepted without being sent.
 */
export const CreateContactMessageSchema = ContactMessageBaseSchema.extend({
  privacyAccepted: z.literal(true),
  challenge: ContactChallengeSolutionSchema,
  website: z.string().max(200).optional(),
});

export type CreateContactMessageDto = z.infer<typeof CreateContactMessageSchema>;
