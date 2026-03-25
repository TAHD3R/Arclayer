import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LayoutGrid, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listMyWorkspaces } from "@/api/workspaces";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserCenterStateCard } from "@/pages/usercenter/shared/account-settings-state-card";

export function UserCenterUsagePage() {
  const { t } = useTranslation("account");
  const workspacesQuery = useQuery({
    queryKey: ["account", "usage", "workspaces"],
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const metrics = useMemo(() => {
    const items = workspacesQuery.data?.items ?? [];
    const totalWorkspaces = items.length;
    const adminWorkspaces = items.filter((item) => item.isCreatorAdmin).length;
    return { totalWorkspaces, adminWorkspaces };
  }, [workspacesQuery.data?.items]);

  return (
    <DefaultPage
      title={t("ACCOUNT_PAGE_USAGE_TITLE")}
      description={t("ACCOUNT_PAGE_USAGE_DESC")}
      showFavoriteToggle={false}
    >
      <ContentGuard
        loading={workspacesQuery.isLoading && !workspacesQuery.data}
        error={workspacesQuery.error}
        onRetry={() => void workspacesQuery.refetch()}
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <UserCenterStateCard
            eyebrow={t("ACCOUNT_PAGE_USAGE_TITLE")}
            title={t("ACCOUNT_USAGE_TOTAL_WORKSPACES_TITLE")}
            description={t("ACCOUNT_USAGE_TOTAL_WORKSPACES_DESC")}
            value={String(metrics.totalWorkspaces)}
            icon={<LayoutGrid />}
          />
          <UserCenterStateCard
            eyebrow={t("ACCOUNT_SECTION_ACCOUNT")}
            title={t("ACCOUNT_USAGE_ADMIN_WORKSPACES_TITLE")}
            description={t("ACCOUNT_USAGE_ADMIN_WORKSPACES_DESC")}
            value={String(metrics.adminWorkspaces)}
            icon={<ShieldCheck />}
          />
          <UserCenterStateCard
            eyebrow={t("ACCOUNT_SETTINGS_TITLE")}
            title={t("ACCOUNT_USAGE_STATUS_TITLE")}
            description={t("ACCOUNT_USAGE_STATUS_DESC")}
            icon={<BarChart3 />}
            tone="warning"
          />
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
