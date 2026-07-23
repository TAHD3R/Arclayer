import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listSystemActivity } from "@/api/activity";
import { listSystemDirectoryProjects } from "@/api/system-directory";
import {
  getSystemWorkspaceCommerceOverview,
  listSystemCommercePlans,
  setSystemWorkspaceSubscription,
  type BillingCycle,
  type SubscriptionStatus,
} from "@/api/commerce";
import { notifyError, notifySuccessText } from "@/lib/notifications";

const WORKSPACE_OPERATIONS_QUERY_OPTIONS = {
  staleTime: 30_000,
  retry: false,
  meta: { silent: true },
} as const;

export function systemWorkspaceCommerceQueryKey(workspaceId: string | null) {
  return ["system", "commerce", "workspace", workspaceId, "overview"] as const;
}

export function systemWorkspaceActivityQueryKey(workspaceId: string | null) {
  return ["system", "directory", "workspace", workspaceId, "activity"] as const;
}

export function systemWorkspaceProjectsQueryKey(workspaceId: string | null) {
  return ["system", "directory", "workspace", workspaceId, "projects"] as const;
}

export function useSystemWorkspaceCommerce(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: systemWorkspaceCommerceQueryKey(workspaceId),
    queryFn: ({ signal }) => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return getSystemWorkspaceCommerceOverview(workspaceId, signal);
    },
    enabled: enabled && Boolean(workspaceId),
    ...WORKSPACE_OPERATIONS_QUERY_OPTIONS,
  });
}

export function useSystemCommercePlanCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ["system", "commerce", "plans", { includeInactive: false }],
    queryFn: ({ signal }) => listSystemCommercePlans(false, signal),
    enabled,
    ...WORKSPACE_OPERATIONS_QUERY_OPTIONS,
  });
}

export function useSystemWorkspaceActivity(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: systemWorkspaceActivityQueryKey(workspaceId),
    queryFn: () => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return listSystemActivity({
        page: 1,
        size: 8,
        workspaceId,
        ordering: "-occurred_at",
      });
    },
    enabled: enabled && Boolean(workspaceId),
    ...WORKSPACE_OPERATIONS_QUERY_OPTIONS,
  });
}

export function useSystemWorkspaceProjects(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: systemWorkspaceProjectsQueryKey(workspaceId),
    queryFn: () => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return listSystemDirectoryProjects({
        page: 1,
        size: 6,
        workspaceId,
        ordering: "-created_at",
      });
    },
    enabled: enabled && Boolean(workspaceId),
    ...WORKSPACE_OPERATIONS_QUERY_OPTIONS,
  });
}

export function useSetSystemWorkspaceSubscription() {
  const { t } = useTranslation(["commerce"]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      workspaceId: string;
      planCode: string;
      status: SubscriptionStatus;
      billingInterval: BillingCycle;
      cancelAtPeriodEnd: boolean;
    }) =>
      setSystemWorkspaceSubscription(params.workspaceId, {
        planCode: params.planCode,
        status: params.status,
        billingInterval: params.billingInterval,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      }),
    onSuccess: async (overview, variables) => {
      queryClient.setQueryData(systemWorkspaceCommerceQueryKey(variables.workspaceId), overview);
      queryClient.setQueryData(
        ["commerce", "workspace", variables.workspaceId, "overview"],
        overview,
      );
      notifySuccessText(t("commerce:API_WORKSPACE_PLAN_UPDATED"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: systemWorkspaceActivityQueryKey(variables.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["dataTable", "system-directory-workspaces"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["system-directory", "workspaces", variables.workspaceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["dataTable", "system-audit-events"] }),
      ]);
    },
    onError: notifyError,
  });
}
