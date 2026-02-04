import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Typography } from "antd";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listMyWorkspaces } from "@/api/workspaces";
import { PageState } from "@/components/common/page-state";
import { DefaultPage } from "@/components/common/default-page";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { pickDefaultWorkspaceId, workspaceHomePath } from "@/lib/workspace-routing";

export const Route = createFileRoute("/")({
  component: WorkspaceEntryPage,
});

function WorkspaceEntryPage() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const accessToken = useAuthStore((s) => s.accessToken);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces"],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const items = workspacesQuery.data?.items ?? [];

  const defaultWorkspaceId = useMemo(
    () => pickDefaultWorkspaceId({ workspaces: items, lastWorkspaceId }),
    [items, lastWorkspaceId],
  );

  const devSetupOverride = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      const params = new URLSearchParams((searchStr || "").replace(/^\?/, ""));
      return params.get("__dev_setup") === "1";
    } catch {
      return false;
    }
  }, [searchStr]);

  useEffect(() => {
    if (!defaultWorkspaceId) return;
    if (devSetupOverride) return;
    setCurrentWorkspaceId(defaultWorkspaceId);
    void navigate({ to: workspaceHomePath(defaultWorkspaceId), replace: true });
  }, [defaultWorkspaceId, devSetupOverride, navigate, setCurrentWorkspaceId]);

  const onSelectWorkspace = async (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    await navigate({ to: workspaceHomePath(workspaceId), replace: true });
  };

  return (
    <DefaultPage title={t("common:WORKSPACE_SELECT_TITLE")}>
      <PageState
        loading={workspacesQuery.isLoading && !workspacesQuery.data}
        error={workspacesQuery.isError ? workspacesQuery.error : null}
        onRetry={workspacesQuery.isError ? () => void workspacesQuery.refetch() : undefined}
      >
        {items.length > 1 || (devSetupOverride && items.length === 1) ? (
          <Card>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {t("common:WORKSPACE_SELECT_TITLE")}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {t("common:WORKSPACE_SELECT_DESC")}
            </Typography.Paragraph>
            {devSetupOverride ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                dev: __dev_setup=1 (disable auto redirect)
              </Typography.Paragraph>
            ) : null}
            <div className="flex flex-col gap-2">
              {items.map((w) => (
                <Button
                  key={w.workspaceId}
                  type="default"
                  size="large"
                  className="justify-start"
                  onClick={() => void onSelectWorkspace(w.workspaceId)}
                >
                  {w.name || w.slug || w.workspaceId}
                </Button>
              ))}
            </div>
          </Card>
        ) : items.length === 1 ? (
          <Card>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {t("common:WORKSPACE_REDIRECTING")}
            </Typography.Paragraph>
          </Card>
        ) : (
          <Card>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {t("common:WORKSPACE_EMPTY_TITLE")}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t("common:WORKSPACE_EMPTY_DESC")}
            </Typography.Paragraph>
          </Card>
        )}
      </PageState>
    </DefaultPage>
  );
}
