export type AssetScopeType = "project" | "organization";

export type AssetScopeRef = {
  type: AssetScopeType;
  id: string;
};

export function assetScopeKey(scope: AssetScopeRef): string {
  return `${scope.type}:${scope.id}`;
}
