import { api } from "@/lib/http";

import type { BootstrapState, BootstrapRepairResult } from "@/types/api";

export async function getBootstrapState(): Promise<BootstrapState> {
  return api.get<BootstrapState>("/me/bootstrap-state");
}

export async function repairBootstrapState(): Promise<BootstrapRepairResult> {
  return api.post<BootstrapRepairResult>("/provision/repair", {});
}
