const BUILTIN_ROLE_NAME_KEYS = {
  owner: "common:ORG_ROLE_OWNER",
  admin: "common:ORG_ROLE_ADMIN",
  member: "common:ORG_ROLE_MEMBER",
} as const;

const BUILTIN_ROLE_DESCRIPTION_KEYS = {
  owner: "common:ORG_ROLE_OWNER_DESC",
  admin: "common:ORG_ROLE_ADMIN_DESC",
  member: "common:ORG_ROLE_MEMBER_DESC",
} as const;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type OrganizationBuiltinRoleCode = keyof typeof BUILTIN_ROLE_NAME_KEYS;

export function isOrganizationBuiltinRoleCode(code: string): code is OrganizationBuiltinRoleCode {
  return code in BUILTIN_ROLE_NAME_KEYS;
}

export function getOrganizationRoleDisplayName(
  t: TranslateFn,
  roleCode: string,
  fallback?: string | null,
): string {
  if (isOrganizationBuiltinRoleCode(roleCode)) {
    return t(BUILTIN_ROLE_NAME_KEYS[roleCode], { defaultValue: fallback || roleCode });
  }
  return String(fallback || roleCode);
}

export function getOrganizationRoleDisplayDescription(
  t: TranslateFn,
  roleCode: string,
  fallback?: string | null,
): string | null {
  if (isOrganizationBuiltinRoleCode(roleCode)) {
    const translated = t(BUILTIN_ROLE_DESCRIPTION_KEYS[roleCode], {
      defaultValue: fallback || "",
    });
    return translated.trim() ? translated : null;
  }
  return fallback?.trim() || null;
}
