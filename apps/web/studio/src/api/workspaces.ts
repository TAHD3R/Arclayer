import { api } from "@/lib/http";
import type { MyWorkspaceListResult } from "@/types/api";

export async function listMyWorkspaces(): Promise<MyWorkspaceListResult> {
  return api.get<MyWorkspaceListResult>("/me/workspaces");
}
