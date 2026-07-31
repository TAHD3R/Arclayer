import type { PlatformEntryEligibilityOut } from "@arclayer/openapi";

import { api } from "@/lib/http";

export function getPlatformEntryEligibility(
  signal?: AbortSignal,
): Promise<PlatformEntryEligibilityOut> {
  return api.get<PlatformEntryEligibilityOut>("/me/platform-entry-eligibility", { signal });
}
