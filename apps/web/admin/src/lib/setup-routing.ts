import type { DeploymentMode } from "@/types/api";

function isSetupPath(pathname: string): boolean {
  return pathname === "/setup" || pathname.startsWith("/setup/");
}

function isAcceptInvitePath(pathname: string): boolean {
  return pathname === "/accept-invite";
}

export function isOnboardingScenePath(pathname: string): boolean {
  return isSetupPath(pathname) || pathname === "/onboarding" || pathname.startsWith("/onboarding/");
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
