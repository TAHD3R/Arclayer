import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";
import type { ProjectDetail } from "@/types/api";

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(projectPath(projectId));
}
