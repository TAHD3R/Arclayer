import type { ReactNode } from "react";

import { useSystemRuntime } from "@/hooks/use-system-runtime";
import type { DeploymentMode, DeploymentScope } from "@/types/api/system";

function isScopeAllowed(scope: DeploymentScope, mode: DeploymentMode): boolean {
  return scope === "both" || scope === mode;
}

export type FeatureGateProps = {
  scope?: DeploymentScope;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Conditionally render UI by deployment scope.
 *
 * Notes:
 * - This is a UI-only gate. Use route guards for security-sensitive boundaries.
 * - When runtime is not ready yet, we render `fallback` to avoid mis-gating.
 */
export function FeatureGate({ scope = "both", children, fallback = null }: FeatureGateProps) {
  const runtime = useSystemRuntime();
  if (!runtime.runtime) return fallback;
  if (!isScopeAllowed(scope, runtime.runtime.deploymentMode)) return fallback;
  return children;
}
