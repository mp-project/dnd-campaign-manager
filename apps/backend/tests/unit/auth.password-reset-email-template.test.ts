import {
  buildPasswordResetUrl,
  renderPasswordResetEmail,
} from "#src/modules/auth/email/PasswordResetEmailTemplate";
import {
  authPasswordResetErrorTranslations,
  getPasswordResetErrorMessage,
} from "#src/modules/auth/lang/AuthLang";

describe("password reset email template", () => {
  it("builds a reset URL containing the token", () => {
    const token = "token-abc";
    const url = buildPasswordResetUrl("http://app.localhost:5173", token);

    expect(url).toBe("http://app.localhost:5173/auth/reset-password?token=token-abc");
  });

  it("renders english email copy by default", () => {
    const email = renderPasswordResetEmail({
      locale: undefined,
      resetUrl: "http://app.localhost:5173/auth/reset-password?token=t",
      expiresAt: new Date("2026-09-26T12:00:00.000Z"),
    });

    expect(email.subject).toBe("Reset your password");
    expect(email.text).toContain("Open this link to set a new password:");
    expect(email.text).toContain("token=t");
    expect(email.text).toContain("one-time link");
  });

  it("renders german email copy when locale starts with de", () => {
    const email = renderPasswordResetEmail({
      locale: "de-DE",
      resetUrl: "http://app.localhost:5173/auth/reset-password?token=t",
      expiresAt: new Date("2026-09-26T12:00:00.000Z"),
    });

    expect(email.subject).toBe("Passwort zuruecksetzen");
    expect(email.text).toContain("Oeffne diesen Link");
    expect(email.text).toContain("nur einmal nutzbar");
  });

  it("keeps english backend error messages and provides language translations", () => {
    expect(getPasswordResetErrorMessage("PASSWORD_RESET_EXPIRED")).toBe(
      "Reset token has expired",
    );

    expect(authPasswordResetErrorTranslations.de.PASSWORD_RESET_EXPIRED).toBe(
      "Reset-Token ist abgelaufen",
    );
  });
});
