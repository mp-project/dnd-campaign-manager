export const AUTH_HTTP_PREFIX = "";

export const AUTH_HTTP_SECURITY = [
  { cookieAuth: [] },
  { bearerAuth: [] },
] as const;

export const AUTH_HTTP_PATHS = {
  registerRequestVerification: "/auth/register/request-verification",
  registerVerificationStatus: "/auth/register/verification/:verificationId/status",
  registerVerify: "/auth/register/verify-email",
  registerVerifyLink: "/auth/register/verify-email-link",
  register: "/auth/register",
  login: "/auth/login",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  logoutAll: "/auth/logout-all",
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  changePassword: "/me/change-password",
  oauthStart: "/auth/oauth/:provider/start",
  oauthCallback: "/auth/oauth/:provider/callback",
  oauthCompleteRegistration: "/auth/oauth/complete-registration",
} as const;

export const AUTH_HTTP_RATE_LIMITS = {
  read: {
    max: 200,
    timeWindow: "1 minute",
  },
  write: {
    max: 60,
    timeWindow: "1 minute",
  },
  auth: {
    max: 20,
    timeWindow: "1 minute",
  },
} as const;
