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

  const workspacesQuery = useQuery({
    queryKey: ["workspace", "me", "workspaces", "landing"],
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

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "landing"],
    enabled: Boolean(workspacesQuery.isSuccess && (workspacesQuery.data?.items?.length ?? 0) === 0),
    queryFn: listMyOrganizations,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const firstAdminOrganizationId = useMemo(() => {
    const items = organizationsQuery.data?.items ?? [];
    const activeAdminItems = items.filter(
      (item) =>
        item.membership.status === "active" &&
        (item.membership.role === "owner" || item.membership.role === "admin"),
    );
    if (!activeAdminItems.length) return null;

    return (
      activeAdminItems
        .slice()
        .sort((left, right) => left.organization.name.localeCompare(right.organization.name))[0]
        ?.organization.id ?? null
    );
  }, [organizationsQuery.data?.items]);

  useEffect(() => {
    if (!firstAdminOrganizationId) return;
    void navigate({ to: `/o/${firstAdminOrganizationId}/workspaces`, replace: true });
  }, [firstAdminOrganizationId, navigate]);

  return (
    <DefaultPage
      width="fixed"
      title={t("nav:NAV_ORG_WORKSPACES")}
      description={t("common:LANDING_WORKSPACE_EMPTY_DESC")}
    >
      <ContentGuard
        loading={
          Boolean(firstWorkspaceId) ||
          Boolean(firstAdminOrganizationId) ||
          (workspacesQuery.isLoading && !workspacesQuery.data) ||
          (organizationsQuery.isLoading && !organizationsQuery.data)
        }
        error={workspacesQuery.error ?? organizationsQuery.error}
        onRetry={() => {
          void workspacesQuery.refetch();
          void organizationsQuery.refetch();
        }}
        empty={!firstWorkspaceId && !firstAdminOrganizationId}
        emptyTitle={t("common:LANDING_WORKSPACE_EMPTY_TITLE")}
        emptyDescription={t("common:LANDING_WORKSPACE_EMPTY_DESC")}
      />
    </DefaultPage>
  );
}
