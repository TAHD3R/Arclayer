import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listMyOrganizations } from "@/api/me";
import { listMyWorkspaces } from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";

export function LandingPage() {
  const { t } = useTranslation(["common", "nav"]);
  const navigate = useNavigate();

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "landing"],
    queryFn: listMyOrganizations,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const firstOrganizationId = useMemo(() => {
    const items = organizationsQuery.data?.items ?? [];
    const activeItems = items.filter((item) => item.membership.status === "active");
    if (!activeItems.length) return null;

    return (
      activeItems
        .slice()
        .sort((left, right) => left.organization.name.localeCompare(right.organization.name))[0]
        ?.organization.id ?? null
    );
  }, [organizationsQuery.data?.items]);

  useEffect(() => {
    if (!firstOrganizationId) return;
    void navigate({ to: `/o/${firstOrganizationId}/workspaces`, replace: true });
  }, [firstOrganizationId, navigate]);

  const workspacesQuery = useQuery({
    queryKey: ["workspace", "me", "workspaces", "landing"],
    enabled: Boolean(
      organizationsQuery.isSuccess &&
      !firstOrganizationId &&
      (organizationsQuery.data?.items?.length ?? 0) === 0,
    ),
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const firstWorkspaceId = useMemo(() => {
    const items = workspacesQuery.data?.items ?? [];
    return items[0]?.workspaceId ?? null;
  }, [workspacesQuery.data?.items]);

  useEffect(() => {
    if (!firstWorkspaceId) return;
    void navigate({ to: `/w/${firstWorkspaceId}/`, replace: true });
  }, [firstWorkspaceId, navigate]);

  return (
    <DefaultPage
      width="fixed"
      title={t("nav:NAV_ORG_WORKSPACES")}
      description={t("common:WORKSPACE_SWITCHER_ORG_EMPTY_DESC")}
    >
      <ContentGuard
        loading={
          Boolean(firstOrganizationId) ||
          Boolean(firstWorkspaceId) ||
          (organizationsQuery.isLoading && !organizationsQuery.data) ||
          (workspacesQuery.isLoading && !workspacesQuery.data)
        }
        error={organizationsQuery.error ?? workspacesQuery.error}
        onRetry={() => {
          void organizationsQuery.refetch();
          void workspacesQuery.refetch();
        }}
        empty={!firstOrganizationId && !firstWorkspaceId}
        emptyTitle={t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
        emptyDescription={t("common:WORKSPACE_SWITCHER_ORG_EMPTY_DESC")}
      />
    </DefaultPage>
  );
}
