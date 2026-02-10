import { api } from "@/lib/http";

export interface BootstrapState {
  ready: boolean;
  repairRequired: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  siteId: string | null;
  nextPath: string;
  reason: string | null;
}

export interface BootstrapRepairResult {
  repaired: boolean;
  ready: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  siteId: string | null;
  actions: string[];
}

export async function getBootstrapState(): Promise<BootstrapState> {
  return api.get<BootstrapState>("/me/bootstrap-state");
}

export async function repairBootstrapState(): Promise<BootstrapRepairResult> {
  return api.post<BootstrapRepairResult>("/provision/repair", {});
}
