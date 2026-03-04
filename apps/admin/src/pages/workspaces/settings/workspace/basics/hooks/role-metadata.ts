import type { Role } from "@/types/api";

export type WorkspaceRoleMetadata = {
  roleItems: Role[];
  initialDefaultRoleCode: string;
  roleOptions: Array<{ label: string; value: string }>;
  roleLabelMap: Map<string, string>;
  roleDescriptionMap: Map<string, string | null>;
};

const FALLBACK_ROLE_CODE = "viewer";

export function buildWorkspaceRoleMetadata(roleItems: Role[]): WorkspaceRoleMetadata {
  const options = roleItems.map((item) => ({ label: item.name, value: item.code }));
  const labelMap = new Map<string, string>();
  const descriptionMap = new Map<string, string | null>();

  for (const role of roleItems) {
    labelMap.set(String(role.code), String(role.name));
    descriptionMap.set(String(role.code), role.description ?? null);
  }

  const initialDefaultRoleCode =
    roleItems.find((item) => item.isDefault)?.code ?? roleItems[0]?.code ?? FALLBACK_ROLE_CODE;

  return {
    roleItems,
    initialDefaultRoleCode,
    roleOptions: options,
    roleLabelMap: labelMap,
    roleDescriptionMap: descriptionMap,
  };
}
