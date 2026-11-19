import { z } from "zod";

/** The message was taken; the answer never says whether it was really sent (honeypot). */
export const ResponseContactMessageSchema = z.strictObject({
  status: z.literal("accepted"),
});

export type ResponseContactMessageDto = z.infer<typeof ResponseContactMessageSchema>;
