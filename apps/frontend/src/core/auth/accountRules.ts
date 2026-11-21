/**
 * The backend's rules for account fields (`UserBaseSchema`), checked before sending so the error
 * shows at the field; the backend checks them again. Passwords are Clerk's.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  const email = value.trim();
  return email.length >= 3 && email.length <= 320 && EMAIL.test(email);
}

export function isDisplayName(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= 120;
}
