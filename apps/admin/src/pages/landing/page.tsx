import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listMyWorkspaces } from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { pickDefaultWorkspaceId } from "@/lib/routing/workspace-routing";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function LandingPage() {
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);

  const workspacesQuery = useQuery({
    queryKey: ["workspace", "me", "workspaces", "landing"],
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const defaultWorkspaceId = useMemo(
    () =>
      pickDefaultWorkspaceId({
        workspaces: workspacesQuery.data?.items ?? [],
        lastWorkspaceId,
      }),
    [lastWorkspaceId, workspacesQuery.data?.items],
  );

  useEffect(() => {
    if (workspacesQuery.isLoading) return;
    if (workspacesQuery.isError) return;
    if (defaultWorkspaceId) {
      void navigate({ to: `/w/${defaultWorkspaceId}/`, replace: true });
      return;
    }
    void navigate({ to: "/account/workspaces", search: { create: undefined }, replace: true });
  }, [defaultWorkspaceId, navigate, workspacesQuery.isError, workspacesQuery.isLoading]);

  return (
    <DefaultPage
      title={t("account:ACCOUNT_PAGE_WORKSPACES_TITLE")}
      description={t("common:LANDING_WORKSPACE_EMPTY_DESC")}
    >
      <ContentGuard
        loading={
          Boolean(defaultWorkspaceId) || (workspacesQuery.isLoading && !workspacesQuery.data)
        }
        error={workspacesQuery.error}
        onRetry={() => {
          void workspacesQuery.refetch();
        }}
        empty={!defaultWorkspaceId}
        emptyTitle={t("common:LANDING_WORKSPACE_EMPTY_TITLE")}
        emptyDescription={t("common:LANDING_WORKSPACE_EMPTY_DESC")}
      />
    </DefaultPage>
  );
}
