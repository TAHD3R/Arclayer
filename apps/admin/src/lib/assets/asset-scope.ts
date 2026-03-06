export type AssetScopeType = "workspace" | "organization" | "user";

export type AssetScopeRef = {
  type: AssetScopeType;
  id: string;
};

export function assetScopeKey(scope: AssetScopeRef): string {
  return `${scope.type}:${scope.id}`;
}
