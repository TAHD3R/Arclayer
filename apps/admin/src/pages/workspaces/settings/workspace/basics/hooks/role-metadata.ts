import type { WorkspaceRoleOut as Role } from "@arclayer/openapi";

export type WorkspaceRoleMetadata = {
  roleItems: Role[];
  initialDefaultRoleCode: string;
  roleOptions: Array<{ label: string; value: string }>;
  roleLabelMap: Map<string, string>;
  roleDescriptionMap: Map<string, string | null>;
};

export function buildWorkspaceRoleMetadata(roleItems: Role[]): WorkspaceRoleMetadata {
  const options = roleItems.map((item) => ({ label: item.name, value: item.code }));
  const labelMap = new Map<string, string>();
  const descriptionMap = new Map<string, string | null>();

  for (const role of roleItems) {
    labelMap.set(String(role.code), String(role.name));
    descriptionMap.set(String(role.code), role.description ?? null);
  }

  const initialDefaultRoleCode =
    roleItems.find((item) => item.isDefault)?.code ?? roleItems[0]?.code ?? "";

  return {
    roleItems,
    initialDefaultRoleCode,
    roleOptions: options,
    roleLabelMap: labelMap,
    roleDescriptionMap: descriptionMap,
  };
}
