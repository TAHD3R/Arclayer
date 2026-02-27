/** Build a workspace-scoped API path: `/workspaces/{id}{path}`. */
export function workspacePath(workspaceId: string, path: string): string {
  const id = encodeURIComponent(String(workspaceId));
  const suffix = path.startsWith("/") ? path : `/${path}`;
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
  const base = organizationWorkspacesBasePath(organizationId);
  const wsId = encodeURIComponent(String(workspaceId));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${base}/${wsId}${suffix}`;
}

// ---------------------------------------------------------------------------
// Organization-scoped resource paths
// ---------------------------------------------------------------------------

/** `/organizations/me/invitations/{id}{path}` */
export function orgInvitationPath(invitationId: string, path?: string): string {
  const id = encodeURIComponent(String(invitationId));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/organizations/me/invitations/${id}${suffix}`;
}

/** `/organizations/me/invitations/links/{id}{path}` */
export function orgInviteLinkPath(linkId: string, path?: string): string {
  const id = encodeURIComponent(String(linkId));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/organizations/me/invitations/links/${id}${suffix}`;
}

/** `/organizations/me/members/{id}{path}` */
export function orgMemberPath(membershipId: string, path?: string): string {
  const id = encodeURIComponent(String(membershipId));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/organizations/me/members/${id}${suffix}`;
}

/** `/organizations/me/rbac/roles/{code}{path}` */
export function orgRbacRolePath(roleCode: string, path?: string): string {
  const code = encodeURIComponent(String(roleCode));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/organizations/me/rbac/roles/${code}${suffix}`;
}

/** `/organizations/me/rbac/permissions/{code}{path}` */
export function orgRbacPermissionPath(permissionCode: string, path?: string): string {
  const code = encodeURIComponent(String(permissionCode));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/organizations/me/rbac/permissions/${code}${suffix}`;
}

// ---------------------------------------------------------------------------
// Site & system paths
// ---------------------------------------------------------------------------

/** `/sites/{siteId}{path}` */
export function sitePath(siteId: string, path?: string): string {
  const id = encodeURIComponent(String(siteId));
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/sites/${id}${suffix}`;
}

/** `/system/settings/{namespace}` */
export function systemSettingsPath(namespace: string): string {
  return `/system/settings/${encodeURIComponent(String(namespace))}`;
}
