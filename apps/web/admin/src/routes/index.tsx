import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Typography } from "antd";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { getBootstrapState, repairBootstrapState } from "@/api/bootstrap";
import { listMyWorkspaces } from "@/api/workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { workspaceHomePath } from "@/lib/workspace-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/")({
  component: WorkspaceEntryPage,
});

function WorkspaceEntryPage() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const accessToken = useAuthStore((s) => s.accessToken);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const bootstrapQuery = useQuery({
    queryKey: ["me", "bootstrapState"],
    enabled: Boolean(accessToken),
    queryFn: async () => getBootstrapState(),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces"],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const items = workspacesQuery.data?.items ?? [];

  const devSetupOverride = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      const params = new URLSearchParams((searchStr || "").replace(/^\?/, ""));
      return params.get("__dev_setup") === "1";
    } catch {
      return false;
    }
  }, [searchStr]);

  const didRepairRef = useRef(false);
  useEffect(() => {
    if (!accessToken) return;
    if (devSetupOverride) return;
    if (didRepairRef.current) return;
    if (!bootstrapQuery.data) return;
    if (bootstrapQuery.data.ready) return;
    if (!bootstrapQuery.data.repairRequired) return;

    didRepairRef.current = true;
    void (async () => {
      const repaired = await repairBootstrapState().catch(() => null);
      if (!repaired?.ready) return;
      await queryClient.invalidateQueries({ queryKey: ["me", "bootstrapState"] });
      await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
    })();
  }, [accessToken, bootstrapQuery.data, devSetupOverride, queryClient]);

  const nextWorkspaceId = useMemo(() => {
    if (bootstrapQuery.data?.workspaceId) return String(bootstrapQuery.data.workspaceId);
    if (items.length === 1) return String(items[0]?.workspaceId || "").trim() || null;
    return null;
  }, [bootstrapQuery.data?.workspaceId, items]);

  useEffect(() => {
    if (!nextWorkspaceId) return;
    if (devSetupOverride) return;
    setCurrentWorkspaceId(nextWorkspaceId);
    void navigate({ to: workspaceHomePath(nextWorkspaceId), replace: true });
  }, [devSetupOverride, navigate, nextWorkspaceId, setCurrentWorkspaceId]);

  const onSelectWorkspace = async (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    await navigate({ to: workspaceHomePath(workspaceId), replace: true });
  };

  const loading =
    (bootstrapQuery.isLoading && !bootstrapQuery.data) ||
    (workspacesQuery.isLoading && !workspacesQuery.data);
  const error = (bootstrapQuery.isError ? bootstrapQuery.error : null) || (workspacesQuery.isError ? workspacesQuery.error : null);

  return (
    <DefaultPage title={t("common:WORKSPACE_SELECT_TITLE")}>
      <PageState
        loading={loading}
        error={error}
        onRetry={
          error
            ? () => {
                void bootstrapQuery.refetch();
                void workspacesQuery.refetch();
              }
            : undefined
        }
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
