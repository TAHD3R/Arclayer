import { useQuery } from "@tanstack/react-query";

import { listSystemActivity } from "@/api/activity";
import {
  getSystemObservabilityOverview,
  listSystemAIUsageGroups,
} from "@/api/platform-observability";
import { getSystemDirectoryProjectOperations } from "@/api/system-directory";

const PROJECT_OPERATIONS_PREVIEW_SIZE = 6;
const PROJECT_USAGE_PERIOD_DAYS = 30;

export function useSystemProjectOperations(projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["system-directory", "projects", projectId, "operations"],
    queryFn: ({ signal }) => {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      return getSystemDirectoryProjectOperations(
        projectId,
        PROJECT_OPERATIONS_PREVIEW_SIZE,
        signal,
      );
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export function useSystemProjectUsage(projectId: string | null, enabled: boolean) {
  const overview = useQuery({
    queryKey: [
      "system",
      "observability",
      "project",
      projectId,
      "overview",
      PROJECT_USAGE_PERIOD_DAYS,
    ],
    queryFn: () => {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      return getSystemObservabilityOverview(PROJECT_USAGE_PERIOD_DAYS, { projectId });
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
  const groups = useQuery({
    queryKey: [
      "system",
      "observability",
      "project",
      projectId,
      "ai-groups",
      PROJECT_USAGE_PERIOD_DAYS,
    ],
    queryFn: ({ signal }) => {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      return listSystemAIUsageGroups(
        {
          days: PROJECT_USAGE_PERIOD_DAYS,
          page: 1,
          size: PROJECT_OPERATIONS_PREVIEW_SIZE,
          projectId,
        },
        signal,
      );
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
  return { overview, groups, days: PROJECT_USAGE_PERIOD_DAYS } as const;
}

export function useSystemProjectActivity(projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["system", "activity", "project", projectId, "recent"],
    queryFn: () => {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      return listSystemActivity({
        page: 1,
        size: PROJECT_OPERATIONS_PREVIEW_SIZE,
        projectId,
        ordering: "-occurred_at",
      });
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}
