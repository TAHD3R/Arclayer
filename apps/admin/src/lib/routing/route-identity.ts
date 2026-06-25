import { GLOBAL_SCENE_ROUTES } from "@/lib/routing/global-routes";

// Centralized route path predicates.
// All path checks tolerate an optional trailing slash so they work with both
// TanStack Router's normalized `location.pathname` (no trailing slash) and
// the browser's raw `window.location.pathname` (may include one).

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function matchesRoute(pathname: string, route: (typeof GLOBAL_SCENE_ROUTES)[number]): boolean {
  const normalizedPathname = normalizePath(pathname);
  const routePath = normalizePath(route.path);
  if (route.match === "exact") return normalizedPathname === routePath;
  if (routePath === "/") return normalizedPathname === "/";
  return normalizedPathname === routePath || normalizedPathname.startsWith(`${routePath}/`);
}

export function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/login/";
}

export function isResetPasswordPath(pathname: string): boolean {
  return pathname === "/reset-password" || pathname === "/reset-password/";
}

export function isAcceptInvitePath(pathname: string): boolean {
  return pathname === "/invitations" || pathname === "/invitations/";
}

export function isWelcomePath(pathname: string): boolean {
  return pathname === "/welcome" || pathname === "/welcome/";
}

export function isSystemPath(pathname: string): boolean {
  return pathname === "/system" || pathname === "/system/" || pathname.startsWith("/system/");
}

export function isGlobalPath(pathname: string): boolean {
  return GLOBAL_SCENE_ROUTES.some((route) => matchesRoute(pathname, route));
}

/** Auth scene paths — login & reset-password (used for layout switching). */
export function isAuthScenePath(pathname: string): boolean {
  return isLoginPath(pathname) || isResetPasswordPath(pathname);
}

/** Public paths that do not require authentication. */
export function isPublicPath(pathname: string): boolean {
  return isLoginPath(pathname) || isResetPasswordPath(pathname) || isAcceptInvitePath(pathname);
}
