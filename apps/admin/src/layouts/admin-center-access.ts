export function canRenderAdminCenterNav(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

export function isOrganizationDangerRoute(pathname: string): boolean {
  return /^\/o\/[^/]+\/settings\/danger\/?$/.test(pathname || "");
}

export function canAccessOrganizationScopedRoute(params: {
  pathname: string;
  role: string | null;
  membershipStatus: string | null | undefined;
}): boolean {
  const { pathname, role, membershipStatus } = params;
  if (membershipStatus !== "active") return false;
  if (canRenderAdminCenterNav(role)) return true;
  return role === "member" && isOrganizationDangerRoute(pathname);
}
