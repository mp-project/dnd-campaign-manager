import type { FastifyReply, FastifyRequest } from "fastify";

import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import { parseCookieHeader, serializeCookie } from "#src/modules/auth/utils/cookies";

export type AuthHttpOptions = {
  secureCookies: boolean;
  frontendOrigin: string;
};

const ACCESS_COOKIE_KEY = "access_token";
const REFRESH_COOKIE_KEY = "refresh_token";
const OAUTH_STATE_COOKIE_KEY = "oauth_state_ctx";
const OAUTH_ONBOARDING_COOKIE_KEY = "oauth_onboarding_ctx";
const TRUSTED_DEVICE_COOKIE_KEY = "trusted_device";

const REFRESH_COOKIE_PATH = "/api/v1/auth";
const OAUTH_COOKIE_PATH = "/api/v1/auth/oauth";
const TRUSTED_DEVICE_COOKIE_PATH = "/api/v1";

/**
 * Cookies, client metadata and frontend redirects the auth controllers share.
 */
export class AuthHttpSupport {
  constructor(private readonly options: AuthHttpOptions) {}

  clientMetadata(request: FastifyRequest): ClientMetadata {
    return {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    };
  }

  readRefreshToken(request: FastifyRequest): string | null {
    return this.readCookie(request, REFRESH_COOKIE_KEY);
  }

  readTrustedDeviceToken(request: FastifyRequest): string | null {
    return this.readCookie(request, TRUSTED_DEVICE_COOKIE_KEY);
  }

  readOAuthState(request: FastifyRequest): string | null {
    return this.readCookie(request, OAUTH_STATE_COOKIE_KEY);
  }

  readOAuthOnboarding(request: FastifyRequest): string | null {
    return this.readCookie(request, OAUTH_ONBOARDING_COOKIE_KEY);
  }

  setSessionCookies(
    reply: FastifyReply,
    session: {
      accessToken: string;
      accessExpiresAt: Date;
      refreshToken: string;
      refreshExpiresAt: Date;
    },
  ): void {
    const accessMaxAgeSeconds = Math.max(
      0,
      Math.floor((session.accessExpiresAt.getTime() - Date.now()) / 1000),
    );
    const refreshMaxAgeSeconds = Math.max(
      0,
      Math.floor((session.refreshExpiresAt.getTime() - Date.now()) / 1000),
    );

    this.writeCookie(reply, ACCESS_COOKIE_KEY, session.accessToken, accessMaxAgeSeconds, "/");
    this.writeCookie(
      reply,
      REFRESH_COOKIE_KEY,
      session.refreshToken,
      refreshMaxAgeSeconds,
      REFRESH_COOKIE_PATH,
    );
  }

  clearSessionCookies(reply: FastifyReply): void {
    this.writeCookie(reply, ACCESS_COOKIE_KEY, "", 0, "/");
    this.writeCookie(reply, REFRESH_COOKIE_KEY, "", 0, REFRESH_COOKIE_PATH);
  }

  setTrustedDeviceCookie(
    reply: FastifyReply,
    device: { token: string; expiresAt: Date },
  ): void {
    this.writeCookie(
      reply,
      TRUSTED_DEVICE_COOKIE_KEY,
      device.token,
      (device.expiresAt.getTime() - Date.now()) / 1000,
      TRUSTED_DEVICE_COOKIE_PATH,
    );
  }

  clearTrustedDeviceCookie(reply: FastifyReply): void {
    this.writeCookie(reply, TRUSTED_DEVICE_COOKIE_KEY, "", 0, TRUSTED_DEVICE_COOKIE_PATH);
  }

  setOAuthStateCookie(reply: FastifyReply, value: string, ttlMs: number): void {
    this.writeCookie(
      reply,
      OAUTH_STATE_COOKIE_KEY,
      value,
      Math.floor(ttlMs / 1000),
      OAUTH_COOKIE_PATH,
    );
  }

  clearOAuthStateCookie(reply: FastifyReply): void {
    this.writeCookie(reply, OAUTH_STATE_COOKIE_KEY, "", 0, OAUTH_COOKIE_PATH);
  }

  setOAuthOnboardingCookie(reply: FastifyReply, value: string, ttlMs: number): void {
    this.writeCookie(
      reply,
      OAUTH_ONBOARDING_COOKIE_KEY,
      value,
      Math.floor(ttlMs / 1000),
      OAUTH_COOKIE_PATH,
    );
  }

  clearOAuthOnboardingCookie(reply: FastifyReply): void {
    this.writeCookie(reply, OAUTH_ONBOARDING_COOKIE_KEY, "", 0, OAUTH_COOKIE_PATH);
  }

  frontendCallbackUrl(
    status: string,
    redirectPath: string,
    extraQuery?: Record<string, string>,
  ): string {
    const url = new URL("/auth/callback", this.options.frontendOrigin);
    url.searchParams.set("status", status);
    url.searchParams.set("redirect", redirectPath);

    if (extraQuery) {
      for (const [key, value] of Object.entries(extraQuery)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  frontendRedirectUrl(redirectPath: string): string {
    return new URL(redirectPath, this.options.frontendOrigin).toString();
  }

  private readCookie(request: FastifyRequest, key: string): string | null {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    return parseCookieHeader(cookieHeader).get(key) ?? null;
  }

  private writeCookie(
    reply: FastifyReply,
    key: string,
    value: string,
    maxAgeSeconds: number,
    path: string,
  ): void {
    const cookie = serializeCookie(key, value, {
      maxAgeSeconds,
      path,
      httpOnly: true,
      secure: this.options.secureCookies,
      sameSite: "Lax",
    });
    const existing = reply.getHeader("set-cookie");

    if (!existing) {
      reply.header("set-cookie", [cookie]);
      return;
    }

    if (Array.isArray(existing)) {
      reply.header("set-cookie", [...existing, cookie]);
      return;
    }

    reply.header("set-cookie", [String(existing), cookie]);
  }
}
