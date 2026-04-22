export function resolveWorkspaceName(
  items: Array<{ workspaceId: string; name: string }> | undefined,
  workspaceId: string | null,
  fallback: string,
): string {
  const found = workspaceId
    ? items?.find((item) => String(item.workspaceId) === workspaceId)
    : undefined;
  return found?.name || fallback;
}
