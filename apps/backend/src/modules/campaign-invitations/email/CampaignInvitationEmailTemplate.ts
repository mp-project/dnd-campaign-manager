export function buildCampaignInvitationAcceptUrl(input: {
  frontendOrigin: string;
  token: string;
}): string {
  const url = new URL("/invitations/accept", input.frontendOrigin);
  url.hash = `token=${encodeURIComponent(input.token)}`;
  return url.toString();
}

export function renderCampaignInvitationEmail(input: {
  campaignName: string;
  role: "EDITOR" | "PLAYER";
  expiresAt: Date;
  acceptUrl: string;
}): { subject: string; text: string } {
  const roleName = input.role === "EDITOR" ? "Editor" : "Spieler";

  return {
    subject: `Einladung zur Kampagne ${input.campaignName}`,
    text: [
      `Du wurdest als ${roleName} zur Kampagne „${input.campaignName}“ eingeladen.`,
      "",
      "Melde dich an oder registriere dich mit dieser E-Mail-Adresse und bestätige die Einladung:",
      input.acceptUrl,
      "",
      `Die Einladung läuft am ${input.expiresAt.toISOString()} ab.`,
      "Falls du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.",
    ].join("\n"),
  };
}
