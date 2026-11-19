export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Address the recipient's answer goes to (e.g. the sender of a contact form). */
  replyTo?: string;
};

export type EmailPort = {
  send(message: EmailMessage): Promise<void>;
};
