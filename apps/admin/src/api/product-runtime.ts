import type { ProductRuntimeOut as ProductRuntime } from "@arclayer/openapi";

import { api } from "@/lib/http";

/** Read the public, non-sensitive bootstrap state owned by the Product API. */
export async function getProductRuntime(): Promise<ProductRuntime> {
  return api.get<ProductRuntime>("/runtime", { auth: { skipRefresh: true } });
}
