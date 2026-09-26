import { AuthError } from "#src/modules/auth/error/http/AuthError";
import type { OAuthCallback, OAuthIdentity, OAuthProviderPort, OAuthStart } from "#src/modules/auth/service/oauth/OAuthProviderPort";

export type GoogleOAuthProviderConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

type GoogleTokenResponse = {
  id_token?: unknown;
};

type GoogleTokenInfoResponse = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  nonce?: unknown;
  name?: unknown;
};

export class GoogleOAuthProvider implements OAuthProviderPort {
  constructor(private readonly config: GoogleOAuthProviderConfig) {}

  async createAuthorizationUrl(input: OAuthStart): Promise<URL> {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.callbackUrl);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", input.state);

    if (input.nonce) {
      url.searchParams.set("nonce", input.nonce);
    }

    if (input.intent === "register") {
      url.searchParams.set("prompt", "consent");
    }

    return url;
  }

  async exchangeAndResolveIdentity(input: OAuthCallback): Promise<OAuthIdentity> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth token exchange failed");
    }

    const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
    const idToken =
      typeof tokenPayload.id_token === "string" ? tokenPayload.id_token : null;

    if (!idToken) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth id_token missing");
    }

    const payload = await this.verifyIdTokenWithTokenInfo(idToken, input.nonce);
    const subject = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const emailVerified = this.resolveEmailVerified(payload.email_verified);
    const displayName =
      typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim()
        : undefined;

    if (!subject || !email) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google identity payload is incomplete");
    }

    return {
      provider: "GOOGLE",
      subject,
      email: email.toLowerCase(),
      emailVerified,
      displayName,
    };
  }

  private resolveEmailVerified(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value.toLowerCase() === "true";
    }

    return false;
  }

  private async verifyIdTokenWithTokenInfo(
    idToken: string,
    expectedNonce: string | undefined,
  ): Promise<GoogleTokenInfoResponse> {
    const tokenInfoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!tokenInfoResponse.ok) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth token validation failed");
    }

    const payload = (await tokenInfoResponse.json()) as GoogleTokenInfoResponse;
    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    const audience = typeof payload.aud === "string" ? payload.aud : "";
    const expiresAt = Number.parseInt(String(payload.exp ?? "0"), 10);

    if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth issuer is invalid");
    }

    if (audience !== this.config.clientId) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth audience is invalid");
    }

    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth token has expired");
    }

    if (expectedNonce) {
      const nonce = typeof payload.nonce === "string" ? payload.nonce : null;

      if (!nonce || nonce !== expectedNonce) {
        throw new AuthError("OAUTH_CALLBACK_FAILED", "Google OAuth nonce validation failed");
      }
    }

    return payload;
  }
}
