const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5 ._-]*$/;

export function normalizeWelcomeDisplayName(value: string): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export function isValidWelcomeDisplayName(value: string | null): boolean {
  if (value === null) return true;
  const normalized = value.trim();
  if (!normalized) return true;
  return DISPLAY_NAME_PATTERN.test(normalized);
}

export function isWorkspaceNameValid(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidInviteEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function validateInviteRow(input: {
  email: string;
  roleCode: string;
}): "empty" | "valid" | "invalid-email" | "missing-role" {
  const email = input.email.trim();
  if (!email) return "empty";
  if (!isValidInviteEmail(email)) return "invalid-email";
  if (!input.roleCode) return "missing-role";
  return "valid";
}
