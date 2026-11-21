import { z } from "zod";

/** The event was taken (also one the app doesn't use, so Clerk doesn't send it again). */
export const ResponseClerkWebhookSchema = z.strictObject({
  status: z.literal("accepted"),
});

export type ResponseClerkWebhookDto = z.infer<typeof ResponseClerkWebhookSchema>;
