import { z } from "zod";
import { SYSTEM_ROLES } from "#core/permissions/roles";

export const UserSystemRoleSchema = z.enum(SYSTEM_ROLES);
export const UserStatusSchema = z.enum(["ACTIVE", "LOCKED", "DISABLED"]);
export const UserThemeSchema = z.enum(["SYSTEM", "LIGHT", "DARK"]);
export const EmailVerificationStatusSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "EXPIRED",
  "SUPERSEDED",
]);

export const UserEmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email();

export const UserDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

export const UserLocaleSchema = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);

function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const UserTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => isValidIanaTimeZone(value), {
    message: "Invalid IANA timezone",
  });

export const UserUiPreferencesSchema = z.record(z.string(), z.unknown());
