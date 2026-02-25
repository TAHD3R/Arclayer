import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listMyOrganizations } from "@/api/me";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
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

  return (
    <DefaultPage
      width="fixed"
      title={t("nav:NAV_ORG_WORKSPACES")}
      description={t("common:WORKSPACE_SWITCHER_ORG_EMPTY_DESC")}
    >
      <ContentGuard
        loading={
          Boolean(firstOrganizationId) || (organizationsQuery.isLoading && !organizationsQuery.data)
        }
        error={organizationsQuery.error}
        onRetry={() => {
          void organizationsQuery.refetch();
        }}
        empty={!firstOrganizationId}
        emptyTitle={t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
        emptyDescription={t("common:WORKSPACE_SWITCHER_ORG_EMPTY_DESC")}
      />
    </DefaultPage>
  );
}
