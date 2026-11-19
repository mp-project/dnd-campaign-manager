import type { ContactTopic } from "#src/modules/contact/domain/dto/BaseContactMessageDto";

const TOPIC_LABEL: Record<ContactTopic, string> = {
  GENERAL: "Allgemeine Frage",
  SUPPORT: "Hilfe und Probleme",
  FEEDBACK: "Feedback und Ideen",
  PRIVACY: "Datenschutz",
  PARTNERSHIP: "Presse und Kooperation",
  OTHER: "Sonstiges",
};

/**
 * The email the contact form sends to the site's team, as plain text: the sender's name and
 * address, the topic and the message as typed. Answering it goes to the sender (`replyTo`).
 */
export function renderContactMessageEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  topic: ContactTopic;
  message: string;
  receivedAt: Date;
}): { subject: string; text: string } {
  const name = `${input.firstName} ${input.lastName}`;
  const topic = TOPIC_LABEL[input.topic];

  return {
    subject: `Kontaktformular: ${topic} – ${name}`,
    text: [
      "Neue Nachricht über das Kontaktformular.",
      "",
      `Name: ${name}`,
      `E-Mail: ${input.email}`,
      `Thema: ${topic}`,
      `Eingegangen: ${input.receivedAt.toISOString()}`,
      "",
      input.message,
      "",
      "Eine Antwort auf diese E-Mail geht direkt an die absendende Person.",
    ].join("\n"),
  };
}
