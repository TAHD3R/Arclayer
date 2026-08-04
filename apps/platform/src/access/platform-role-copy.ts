import type { TFunction } from "i18next";

const BUILT_IN_ROLE_COPY = {
  "access-security-operator": {
    description: "BUILT_IN_ROLE_ACCESS_SECURITY_DESCRIPTION",
    name: "BUILT_IN_ROLE_ACCESS_SECURITY_NAME",
  },
  "commerce-operations-operator": {
    description: "BUILT_IN_ROLE_COMMERCE_DESCRIPTION",
    name: "BUILT_IN_ROLE_COMMERCE_NAME",
  },
  "platform-operations-reader": {
    description: "BUILT_IN_ROLE_OPERATIONS_DESCRIPTION",
    name: "BUILT_IN_ROLE_OPERATIONS_NAME",
  },
  "tenant-governance-operator": {
    description: "BUILT_IN_ROLE_TENANT_DESCRIPTION",
    name: "BUILT_IN_ROLE_TENANT_NAME",
  },
} as const;

export function localizePlatformRole(
  role: Readonly<{ code: string; name: string; description?: string | null }>,
  t: TFunction<"access">,
): Readonly<{ name: string; description: string | null }> {
  const copy = BUILT_IN_ROLE_COPY[role.code as keyof typeof BUILT_IN_ROLE_COPY];
  if (!copy) return { name: role.name, description: role.description ?? null };
  return { name: t(copy.name), description: t(copy.description) };
}
