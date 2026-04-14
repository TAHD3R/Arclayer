// Centralized route path predicates.
// All path checks tolerate an optional trailing slash so they work with both
// TanStack Router's normalized `location.pathname` (no trailing slash) and
// the browser's raw `window.location.pathname` (may include one).

export function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/login/";
}

export function isResetPasswordPath(pathname: string): boolean {
  return pathname === "/reset-password" || pathname === "/reset-password/";
}

export function isAcceptInvitePath(pathname: string): boolean {
  return pathname === "/invitations" || pathname === "/invitations/";
}

export function isSystemPath(pathname: string): boolean {
  return pathname === "/system" || pathname === "/system/" || pathname.startsWith("/system/");
}

export function isGlobalPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/workspaces" ||
    pathname === "/workspaces/" ||
    isSystemPath(pathname)
  );
}

/** Auth scene paths — login & reset-password (used for layout switching). */
export function isAuthScenePath(pathname: string): boolean {
  return isLoginPath(pathname) || isResetPasswordPath(pathname);
}

/** Public paths that do not require authentication. */
export function isPublicPath(pathname: string): boolean {
  return isLoginPath(pathname) || isResetPasswordPath(pathname) || isAcceptInvitePath(pathname);
}
