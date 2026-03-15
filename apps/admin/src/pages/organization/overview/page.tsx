import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listMyWorkspaces } from "@/api/workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { Button } from "@celestial/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@celestial/ui/card";

export function OrganizationOverviewPage() {
  const { orgId } = useParams({ from: "/o/$orgId/" });
  const { t } = useTranslation(["nav", "common", "team"]);
  const navigate = useNavigate();

  const workspacesQuery = useQuery({
    queryKey: ["organization", "overview", "workspaces"],
    queryFn: async () => listMyWorkspaces(),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceItems = workspacesQuery.data?.items ?? [];
  const workspaceCount = useMemo(() => {
    const id = String(orgId || "").trim();
    if (!id) return workspaceItems.length;
    return workspaceItems.filter((w) => String(w.organizationId) === id).length;
  }, [orgId, workspaceItems]);

  return (
    <DefaultPage
      title={t("nav:NAV_ORG_OVERVIEW")}
      description={t("common:ORG_OVERVIEW_DESC")}
      contentClassName="min-h-0"
    >
      <ContentGuard
        loading={workspacesQuery.isLoading && !workspacesQuery.data}
        error={workspacesQuery.error}
        onRetry={() => void workspacesQuery.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="text-caption font-medium uppercase tracking-[0.12em] text-label-secondary">
                {t("common:ORG_OVERVIEW_WORKSPACE_COUNT")}
              </div>
              <CardTitle className="text-largetitle leading-none text-label-primary">
                {workspaceCount}
                <span className="ml-2 text-body font-medium text-label-secondary">
                  {t("common:ORG_OVERVIEW_WORKSPACE_UNIT")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2 pt-0">
              <Button
                onClick={() => void navigate({ to: buildOrganizationPath(orgId, "/workspaces") })}
              >
                {t("nav:NAV_ORG_WORKSPACES")}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate({
                    to: buildOrganizationPath(orgId, "/team/members"),
                  })
                }
              >
                {t("nav:NAV_ORG_MEMBERS")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="text-title3">{t("common:ORG_OVERVIEW_NEXT_TITLE")}</CardTitle>
              <p className="text-footnote text-label-secondary">
                {t("common:ORG_OVERVIEW_NEXT_DESC")}
              </p>
            </CardHeader>
          </Card>
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
