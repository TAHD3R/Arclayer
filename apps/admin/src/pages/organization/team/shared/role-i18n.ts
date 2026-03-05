type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
const ROLE_CODE_NORMALIZE_PATTERN = /[^A-Z0-9]+/g;

function toRoleKey(roleCode: string): string {
  const normalized = String(roleCode || "")
    .trim()
    .toUpperCase()
    .replace(ROLE_CODE_NORMALIZE_PATTERN, "_")
    .replace(/^_+|_+$/g, "");
  return normalized;
}

export function getOrganizationRoleDisplayName(
  t: TranslateFn,
  roleCode: string,
  fallback?: string | null,
): string {
  const roleKey = toRoleKey(roleCode);
  const fallbackText = String(fallback || roleCode || "");
  if (!roleKey) return fallbackText;
  const translationKey = `common:ORG_ROLE_${roleKey}`;
  return t(translationKey, { defaultValue: fallbackText });
}

export function getOrganizationRoleDisplayDescription(
  t: TranslateFn,
  roleCode: string,
  fallback?: string | null,
): string | null {
  const roleKey = toRoleKey(roleCode);
  if (!roleKey) {
    return fallback?.trim() || null;
  }
  const translationKey = `common:ORG_ROLE_${roleKey}_DESC`;
  const translated = t(translationKey, { defaultValue: fallback || "" });
  return translated.trim() ? translated : null;
}
