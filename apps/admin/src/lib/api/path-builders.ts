/** Encode an ID and append an optional sub-path. Internal helper – not exported. */
function buildResourcePath(base: string, id: string, path?: string): string {
  const encoded = encodeURIComponent(String(id));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${base}/${encoded}${suffix}`;
}

/** Build a workspace-scoped API path: `/workspaces/{id}{path}`. */
export function workspacePath(workspaceId: string, path?: string): string {
  const id = encodeURIComponent(String(workspaceId));
  const raw = String(path ?? "");

  // Avoid generating a trailing slash when `path` is empty, because backend redirects
  // `/workspaces/{id}/` -> `/workspaces/{id}` can turn into a cross-origin redirect
  // under Vite proxy (changeOrigin=true), triggering CORS failures.
  if (!raw) return `/workspaces/${id}`;

  const suffix = raw.startsWith("/") ? raw : `/${raw}`;
  return `/workspaces/${id}${suffix}`;
}

/** Build a project-scoped API path: `/projects/{id}{path}`. */
export function projectPath(projectId: string, path?: string): string {
  const id = encodeURIComponent(String(projectId));
  const raw = String(path ?? "");
  if (!raw) return `/projects/${id}`;
  const suffix = raw.startsWith("/") ? raw : `/${raw}`;
  return `/projects/${id}${suffix}`;
}

// ---------------------------------------------------------------------------
// Site & system paths
// ---------------------------------------------------------------------------

/** `/sites/{siteId}{path}` */
export function sitePath(siteId: string, path?: string): string {
  return buildResourcePath("/sites", siteId, path);
}

/** `/system/settings/{namespace}` */
export function systemSettingsPath(namespace: string): string {
  return `/system/settings/${encodeURIComponent(String(namespace))}`;
}
