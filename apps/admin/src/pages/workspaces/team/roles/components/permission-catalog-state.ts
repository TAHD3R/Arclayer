import type {
  Permission,
  Role,
  RolePermissionGrant,
  WorkspacePermissionCatalog,
} from "@arclayer/openapi/admin-types";

export type PermissionGrantsByRole = Record<string, RolePermissionGrant[]>;

export type PermissionCatalogDiff = {
  added: string[];
  changed: string[];
  removed: string[];
};

function normalizeConditionSets(grant: {
  permissionCode: string;
  conditionSets?: RolePermissionGrant["conditionSets"];
}): RolePermissionGrant {
  return {
    permissionCode: String(grant.permissionCode || "").trim(),
    conditionSets: grant.conditionSets ?? [],
  };
}

export function normalizeRoleGrants(role: Role): RolePermissionGrant[] {
  const grantsByCode = new Map(
    (role.permissionGrants ?? []).map((grant) => {
      const normalized = normalizeConditionSets(grant);
      return [normalized.permissionCode, normalized] as const;
    }),
  );
  for (const code of role.permissionCodes ?? []) {
    const normalizedCode = String(code || "").trim();
    if (normalizedCode && !grantsByCode.has(normalizedCode)) {
      grantsByCode.set(normalizedCode, { permissionCode: normalizedCode, conditionSets: [] });
    }
  }
  return Array.from(grantsByCode.values()).sort((left, right) =>
    left.permissionCode.localeCompare(right.permissionCode),
  );
}

export function buildGrantsByRole(roles: Role[]): PermissionGrantsByRole {
  return Object.fromEntries(roles.map((role) => [role.code, normalizeRoleGrants(role)]));
}

export function serializeRoleGrants(grants: RolePermissionGrant[] | undefined): string {
  return JSON.stringify(
    [...(grants ?? [])]
      .map(normalizeConditionSets)
      .sort((left, right) => left.permissionCode.localeCompare(right.permissionCode)),
  );
}

export function grantsChanged(
  baseline: RolePermissionGrant[] | undefined,
  draft: RolePermissionGrant[] | undefined,
): boolean {
  return serializeRoleGrants(baseline) !== serializeRoleGrants(draft);
}

export function togglePermissionGrant(
  grants: RolePermissionGrant[] | undefined,
  permissionCode: string,
  checked: boolean,
): RolePermissionGrant[] {
  const next = new Map((grants ?? []).map((grant) => [grant.permissionCode, grant] as const));
  if (checked) {
    next.set(permissionCode, next.get(permissionCode) ?? { permissionCode, conditionSets: [] });
  } else {
    next.delete(permissionCode);
  }
  return Array.from(next.values()).sort((left, right) =>
    left.permissionCode.localeCompare(right.permissionCode),
  );
}

function permissionDefinitionSignature(permission: Permission): string {
  return JSON.stringify({
    name: permission.name,
    description: permission.description,
    groupCode: permission.groupCode,
    ownerKey: permission.ownerKey,
    lifecycle: permission.lifecycle,
    replacementCode: permission.replacementCode,
    conditionTemplates: permission.conditionTemplates,
  });
}

export function diffCatalogDefinitions(
  previous: WorkspacePermissionCatalog,
  next: WorkspacePermissionCatalog,
): PermissionCatalogDiff {
  const previousByCode = new Map(
    (previous.permissions ?? []).map((permission) => [permission.code, permission]),
  );
  const nextByCode = new Map(
    (next.permissions ?? []).map((permission) => [permission.code, permission]),
  );
  const added = [...nextByCode.keys()].filter((code) => !previousByCode.has(code)).sort();
  const removed = [...previousByCode.keys()].filter((code) => !nextByCode.has(code)).sort();
  const changed = [...nextByCode.entries()]
    .filter(([code, permission]) => {
      const prior = previousByCode.get(code);
      return (
        prior && permissionDefinitionSignature(prior) !== permissionDefinitionSignature(permission)
      );
    })
    .map(([code]) => code)
    .sort();
  return { added, changed, removed };
}

export function preserveCompatibleDraft(
  nextRoles: Role[],
  nextPermissions: Permission[],
  previousDraft: PermissionGrantsByRole,
): PermissionGrantsByRole {
  const availableCodes = new Set(nextPermissions.map((permission) => permission.code));
  return Object.fromEntries(
    nextRoles.map((role) => {
      if (role.isSystem || !(role.code in previousDraft)) {
        return [role.code, normalizeRoleGrants(role)];
      }
      const compatible = (previousDraft[role.code] ?? []).filter((grant) =>
        availableCodes.has(grant.permissionCode),
      );
      return [role.code, compatible];
    }),
  );
}

export function conditionSetCount(
  grants: RolePermissionGrant[] | undefined,
  permissionCode: string,
): number {
  return (
    grants?.find((grant) => grant.permissionCode === permissionCode)?.conditionSets?.length ?? 0
  );
}
