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

/** Build the base path for organization-workspace endpoints. */
export function organizationWorkspacesBasePath(organizationId?: string): string {
  if (!organizationId) return "/organizations/me/workspaces";
  const id = encodeURIComponent(String(organizationId));
  return `/organizations/${id}/workspaces`;
}

/** Build the path for organization-plugin endpoints. */
export function orgPluginPath(pluginRef?: string): string {
  if (!pluginRef) return "/organizations/current/plugins";
  return `/organizations/current/plugins/${encodeURIComponent(pluginRef)}`;
}

/** Build path for a specific workspace under organization-workspaces. */
export function organizationWorkspacePath(
  organizationId: string | undefined,
  workspaceId: string,
  path?: string,
): string {
  return buildResourcePath(organizationWorkspacesBasePath(organizationId), workspaceId, path);
}

// ---------------------------------------------------------------------------
// Organization-scoped resource paths
// ---------------------------------------------------------------------------

/** `/organizations/me/invitations/{id}{path}` */
export function orgInvitationPath(invitationId: string, path?: string): string {
  return buildResourcePath("/organizations/me/invitations", invitationId, path);
}

/** `/organizations/me/invitations/links/{id}{path}` */
export function orgInviteLinkPath(linkId: string, path?: string): string {
  return buildResourcePath("/organizations/me/invitations/links", linkId, path);
}

/** `/organizations/me/members/{id}{path}` */
export function orgMemberPath(membershipId: string, path?: string): string {
  return buildResourcePath("/organizations/me/members", membershipId, path);
}

/** `/organizations/me/rbac/roles/{code}{path}` */
export function orgRbacRolePath(roleCode: string, path?: string): string {
  return buildResourcePath("/organizations/me/rbac/roles", roleCode, path);
}

/** `/organizations/me/rbac/permissions/{code}{path}` */
export function orgRbacPermissionPath(permissionCode: string, path?: string): string {
  return buildResourcePath("/organizations/me/rbac/permissions", permissionCode, path);
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
