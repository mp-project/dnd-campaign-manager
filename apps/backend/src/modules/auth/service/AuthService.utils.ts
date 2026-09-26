export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeRedirectPath(input: string): string {
  const value = input.trim();

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
