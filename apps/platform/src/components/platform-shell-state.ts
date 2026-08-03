import type { PlatformCapabilityCatalogOut } from "@arclayer/platform-openapi";

import {
  CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE,
  CapabilityNavigationContractError,
  projectCapabilityNavigation,
  type CapabilityNavigationProjection,
} from "@/capabilities/navigation-projection";
import type { PlatformCapabilityCatalogState } from "@/capabilities/use-capability-catalog";

export type ResolvedCapabilityState =
  | Readonly<{ status: "loading"; retry: () => void }>
  | Readonly<{
      status: "error";
      errorCode: string;
      errorMessage: string;
      retry: () => void;
    }>
  | Readonly<{
      status: "success";
      capabilities: PlatformCapabilityCatalogOut["items"];
      projection: CapabilityNavigationProjection;
      retry: () => void;
    }>;

export function resolveCapabilityState(
  state: PlatformCapabilityCatalogState,
): ResolvedCapabilityState {
  if (state.status === "loading") return state;
  if (state.status === "error") {
    return {
      status: "error",
      errorCode: "PLATFORM_CAPABILITY_CATALOG_UNAVAILABLE",
      errorMessage: "The Platform Capability Catalog could not be loaded.",
      retry: state.retry,
    };
  }

  try {
    return {
      status: "success",
      capabilities: state.catalog.items,
      projection: projectCapabilityNavigation(state.catalog.items),
      retry: state.retry,
    };
  } catch (error) {
    if (error instanceof CapabilityNavigationContractError) {
      return {
        status: "error",
        errorCode: error.code,
        errorMessage: error.message,
        retry: state.retry,
      };
    }
    return {
      status: "error",
      errorCode: CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Platform capability navigation projection failed without an Error message.",
      retry: state.retry,
    };
  }
}
