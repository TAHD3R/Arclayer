export function workspacePath(workspaceId: string, path: string): string {
  const id = encodeURIComponent(String(workspaceId));
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/workspaces/${id}${suffix}`;
}
