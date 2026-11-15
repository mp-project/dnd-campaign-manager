import { api, type ApiData, unwrap } from "@/core/api/client";

/** The own account: profile and settings (users), sign-in, devices and sessions (auth). */
export type Session = ApiData<"listSessions">["items"][number];
export type TrustedDevice = ApiData<"listTrustedDevices">["items"][number];

export function updateProfile(body: { displayName: string }) {
  return unwrap(api.PATCH("/api/v1/me", { body }));
}

export function updateSettings(body: { locale?: string; timezone?: string }) {
  return unwrap(api.PATCH("/api/v1/me/settings", { body }));
}

export function requestEmailChange(body: { email: string; currentPassword?: string }) {
  return unwrap(api.POST("/api/v1/me/email-change", { body }));
}

export function confirmEmailChange(body: { verificationCode: string }) {
  return unwrap(api.POST("/api/v1/me/email-change/confirm", { body }));
}

/** Ends every session, this one too (the server drops the cookies). */
export function changePassword(body: { currentPassword: string; newPassword: string }) {
  return unwrap(api.POST("/api/v1/me/change-password", { body }));
}

export function listSessions() {
  return unwrap(api.GET("/api/v1/auth/sessions"));
}

export function endSession(sessionId: string) {
  return unwrap(api.DELETE("/api/v1/auth/sessions/{sessionId}", { params: { path: { sessionId } } }));
}

export function listTrustedDevices() {
  return unwrap(api.GET("/api/v1/me/trusted-devices"));
}

export function trustThisDevice() {
  return unwrap(api.POST("/api/v1/me/trusted-device"));
}

export function removeTrustedDevice(deviceId: string) {
  return unwrap(api.DELETE("/api/v1/me/trusted-devices/{deviceId}", { params: { path: { deviceId } } }));
}
