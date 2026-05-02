import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type { PageData } from "@arclayer/openapi/admin-types";

export type PublishJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type PublishJobType = "scheduled_publish" | "manual_publish" | "retry";

export type PublishJob = {
  id: string;
  workspaceId: string;
  siteId: string;
  projectId?: string | null;
  releaseId?: string | null;
  jobType: PublishJobType;
  status: PublishJobStatus;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListSystemJobsParams = {
  page?: number;
  size?: number;
  status?: PublishJobStatus | "all";
  jobType?: PublishJobType | "all";
};

export function buildSystemJobsQueryKey(params: ListSystemJobsParams) {
  return ["system", "jobs", params] as const;
}

export async function listSystemJobs(
  params: ListSystemJobsParams = {},
): Promise<PageData<PublishJob>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    status: params.status === "all" ? undefined : params.status,
    jobType: params.jobType === "all" ? undefined : params.jobType,
  });
  return api.get<PageData<PublishJob>>(`/system/jobs${query}`);
}

export async function retrySystemJob(jobId: string): Promise<PublishJob> {
  return api.post<PublishJob>(`/system/jobs/${jobId}/retry`);
}
