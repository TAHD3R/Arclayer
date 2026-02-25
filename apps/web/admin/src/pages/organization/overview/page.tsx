import { Button, Card, Statistic } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listMyWorkspaces } from "@/api/workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { buildOrganizationPath } from "@/lib/organization-routing";

export function OrganizationOverviewPage(props: { organizationId: string }) {
  const { t } = useTranslation(["nav", "common", "team"]);
  const navigate = useNavigate();

  const workspacesQuery = useQuery({
    queryKey: ["organization", "overview", "workspaces"],
    queryFn: async () => listMyWorkspaces(),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceCount = workspacesQuery.data?.items?.length ?? 0;

  return (
    <DefaultPage
      title={t("nav:NAV_ORG_OVERVIEW")}
      description={t("common:ORG_OVERVIEW_DESC")}
      width="full"
      contentClassName="min-h-0"
    >
      <PageState
        loading={workspacesQuery.isLoading && !workspacesQuery.data}
        error={workspacesQuery.error}
        onRetry={() => void workspacesQuery.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <Statistic
              title={t("common:ORG_OVERVIEW_WORKSPACE_COUNT")}
              value={workspaceCount}
              suffix={t("common:ORG_OVERVIEW_WORKSPACE_UNIT")}
            />
            <div className="mt-4 flex gap-2">
              <Button
                type="primary"
                onClick={() =>
                  void navigate({ to: buildOrganizationPath(props.organizationId, "/workspaces") })
                }
              >
                {t("nav:NAV_ORG_WORKSPACES")}
              </Button>
              <Button
                onClick={() =>
                  void navigate({
                    to: buildOrganizationPath(props.organizationId, "/team/members"),
                  })
                }
              >
                {t("nav:NAV_ORG_MEMBERS")}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="space-y-2">
              <h3 className="text-title3 font-semibold">{t("common:ORG_OVERVIEW_NEXT_TITLE")}</h3>
              <p className="text-footnote text-label-secondary">
                {t("common:ORG_OVERVIEW_NEXT_DESC")}
              </p>
            </div>
          </Card>
        </div>
      </PageState>
    </DefaultPage>
  );
}
