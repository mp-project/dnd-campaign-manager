export type EmailMessage = {
  /** What the mail is for (`contact`, `campaignInvitations.invite` …); logged, never the content. */
  purpose: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Address the recipient's answer goes to (e.g. the sender of a contact form). */
  replyTo?: string;
};

export type EmailPort = {
  /** Throws `ServiceUnavailableError` (503, with the cause) when the mail could not be sent. */
  send(message: EmailMessage): Promise<void>;
};
