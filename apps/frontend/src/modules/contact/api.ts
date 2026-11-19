import { api, unwrap } from "@/core/api/client";
import type { operations } from "@/core/api/generated/schema";

/** A message of the contact form as the backend takes it. */
export type ContactMessage = NonNullable<operations["sendContactMessage"]["requestBody"]>["content"]["application/json"];
export type ContactTopic = ContactMessage["topic"];

/** What a message can be about, in the order the form offers them; the backend names it in the email. */
export const CONTACT_TOPICS = [
  "GENERAL",
  "SUPPORT",
  "FEEDBACK",
  "PRIVACY",
  "PARTNERSHIP",
  "OTHER",
] as const satisfies readonly ContactTopic[];

/**
 * Sends a message of the contact form; needs no session. 202 when it was taken (also when the
 * backend drops it as spam), 503 while the site has no contact address.
 */
export function sendContactMessage(body: ContactMessage) {
  return unwrap(api.POST("/api/v1/contact", { body }));
}
