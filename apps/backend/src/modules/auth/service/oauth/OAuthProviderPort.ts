import type { OAuthIntent, OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";

export type OAuthStart = {
  state: string;
  nonce: string | undefined;
  intent: OAuthIntent;
};

export type OAuthCallback = {
  code: string;
  nonce: string | undefined;
};

export type OAuthIdentity = {
  provider: OAuthProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | undefined;
};

export interface OAuthProviderPort {
  createAuthorizationUrl(input: OAuthStart): Promise<URL>;
  exchangeAndResolveIdentity(input: OAuthCallback): Promise<OAuthIdentity>;
}
