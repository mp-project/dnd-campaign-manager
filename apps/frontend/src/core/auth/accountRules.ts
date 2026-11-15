/**
 * The backend's rules for account fields (`UserBaseSchema`, auth DTOs: `RegisterSchema`,
 * `ResetPasswordSchema`, `ChangePasswordSchema`), checked before sending so the error shows at
 * the field; the backend checks them again. One place for the sign-in pages and the account.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  const email = value.trim();
  return email.length >= 3 && email.length <= 320 && EMAIL.test(email);
}

export function isPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}

export function isDisplayName(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= 120;
}
