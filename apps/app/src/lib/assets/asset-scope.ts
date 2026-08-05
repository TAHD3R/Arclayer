export type AssetScopeType = "project" | "workspace";

export type AssetScopeRef = {
  type: AssetScopeType;
  id: string;
};

export function assetScopeKey(scope: AssetScopeRef): string {
  return `${scope.type}:${scope.id}`;
}
