import { AuthError } from "#src/modules/auth/error/http/AuthError";
import type {
  OAuthCallback,
  OAuthIdentity,
  OAuthProviderPort,
  OAuthStart,
} from "#src/modules/auth/service/oauth/OAuthProviderPort";

export type DiscordOAuthProviderConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

type DiscordTokenResponse = {
  access_token?: unknown;
};

type DiscordUserResponse = {
  id?: unknown;
  email?: unknown;
  verified?: unknown;
  global_name?: unknown;
  username?: unknown;
};

export class DiscordOAuthProvider implements OAuthProviderPort {
  constructor(private readonly config: DiscordOAuthProviderConfig) {}

  async createAuthorizationUrl(input: OAuthStart): Promise<URL> {
    const url = new URL("https://discord.com/oauth2/authorize");

    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.callbackUrl);
    url.searchParams.set("scope", "identify email");
    url.searchParams.set("state", input.state);

    if (input.intent === "register") {
      url.searchParams.set("prompt", "consent");
    }

    return url;
  }

  async exchangeAndResolveIdentity(input: OAuthCallback): Promise<OAuthIdentity> {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
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
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Discord OAuth token exchange failed");
    }

    const tokenPayload = (await tokenResponse.json()) as DiscordTokenResponse;
    const accessToken =
      typeof tokenPayload.access_token === "string"
        ? tokenPayload.access_token
        : null;

    if (!accessToken) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Discord OAuth access token missing");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Discord OAuth profile request failed");
    }

    const profile = (await userResponse.json()) as DiscordUserResponse;
    const subject = typeof profile.id === "string" ? profile.id : null;
    const email = typeof profile.email === "string" ? profile.email : null;
    const emailVerified = profile.verified === true;
    const displayName = this.resolveDisplayName(profile);

    if (!subject || !email) {
      throw new AuthError("OAUTH_CALLBACK_FAILED", "Discord identity payload is incomplete");
    }

    return {
      provider: "DISCORD",
      subject,
      email: email.toLowerCase(),
      emailVerified,
      displayName,
    };
  }

  private resolveDisplayName(profile: DiscordUserResponse): string | undefined {
    if (typeof profile.global_name === "string" && profile.global_name.trim()) {
      return profile.global_name.trim();
    }

    if (typeof profile.username === "string" && profile.username.trim()) {
      return profile.username.trim();
    }

    return undefined;
  }
}
