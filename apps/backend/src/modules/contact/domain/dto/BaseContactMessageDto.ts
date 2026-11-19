import { z } from "zod";

/** What a contact message is about; the form offers them as a choice and the email names them. */
export const CONTACT_TOPICS = ["GENERAL", "SUPPORT", "FEEDBACK", "PRIVACY", "PARTNERSHIP", "OTHER"] as const;
export const ContactTopicSchema = z.enum(CONTACT_TOPICS);
export type ContactTopic = z.infer<typeof ContactTopicSchema>;

/** One line of text: no line breaks, so a name can't add lines to the email's subject. */
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n]*$/, "Must be a single line");

export const ContactMessageBaseSchema = z.strictObject({
  firstName: singleLine(100),
  lastName: singleLine(100),
  email: z.string().trim().email().max(320),
  topic: ContactTopicSchema,
  message: z.string().trim().min(10).max(5000),
});
