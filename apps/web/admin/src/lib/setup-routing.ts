import type { DeploymentMode } from "@/types/api";
import { isAcceptInvitePath, isSetupPath } from "@/lib/route-identity";

/**
 * Checks whether the dev-only setup override is active.
 * In production builds this always returns false.
 */
export function isDevSetupOverrideEnabled(searchStr: string): boolean {
  if (!import.meta.env.DEV) return false;

  // Explicit opt-in only: keep behavior identical in production builds.
  try {
    const params = new URLSearchParams((searchStr || "").replace(/^\?/, ""));
    if (params.get("__dev_setup") === "1") return true;
  } catch {
    // ignore
  }

  try {
    return window.localStorage.getItem("celestial.dev.allow_setup") === "1";
  } catch {
    return false;
  }
}

export function resolveSetupGateRedirect(params: {
  deploymentMode: DeploymentMode | null;
  initialized: boolean | null;
  pathname: string;
  devAllowSetup: boolean;
}): string | null {
  const { deploymentMode, initialized, pathname, devAllowSetup } = params;
  const setupRoute = isSetupPath(pathname);
  const acceptInviteRoute = isAcceptInvitePath(pathname);

  if (setupRoute) {
    if (deploymentMode === "saas") {
      return "/login";
    }
    if (initialized === true && !devAllowSetup) {
      return "/login";
    }
  }

  // Legacy fallback: when runtime probe is unavailable, keep self-host oriented behavior.
  const shouldForceSetup =
    initialized === false && !setupRoute && !acceptInviteRoute && deploymentMode !== "saas";
  if (shouldForceSetup) {
    return "/setup";
  }

  return null;
}
