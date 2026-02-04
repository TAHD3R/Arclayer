import { Input as AntInput } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getWorkspaceSiteSetting, upsertWorkspaceSiteSetting } from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const THEME_CONFIG_NAMESPACE = "theme.config";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "null";
  }
}

export function WorkspaceThemesView() {
  const { t } = useTranslation(["appearance", "nav", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const queryClient = useQueryClient();

  const settingQuery = useQuery({
    queryKey: ["workspace", workspaceId, "siteSetting", THEME_CONFIG_NAMESPACE],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return getWorkspaceSiteSetting(String(workspaceId), THEME_CONFIG_NAMESPACE);
    },
    staleTime: 10 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const [rawJson, setRawJson] = React.useState<string>("{}");
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRawJson(safeStringify(settingQuery.data?.value ?? {}));
    setJsonError(null);
  }, [settingQuery.data?.value]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      let parsed: Record<string, unknown> | null = null;
      const trimmed = rawJson.trim();
      if (trimmed) {
        const v: unknown = JSON.parse(trimmed);
        parsed = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
      }
      return upsertWorkspaceSiteSetting(String(workspaceId), THEME_CONFIG_NAMESPACE, parsed);
    },
    onSuccess: () => {
      notifySuccessText(t("common:REQUEST_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: ["workspace", workspaceId, "siteSetting", THEME_CONFIG_NAMESPACE],
      });
    },
    onError: (err) => notifyError(err),
  });

  const onSave = () => {
    try {
      JSON.parse(rawJson);
      setJsonError(null);
    } catch {
      setJsonError(t("appearance:THEME_CONFIG_JSON_INVALID"));
      return;
    }
    saveMutation.mutate();
  };

  return (
    <DefaultPage
      title={t("nav:NAV_APPEARANCE_THEMES")}
      description={t("appearance:THEME_CONFIG_DESC")}
    >
      <PageState
        loading={settingQuery.isLoading}
        error={settingQuery.error}
        empty={false}
        onRetry={() => settingQuery.refetch()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">{t("appearance:THEME_CONFIG_TITLE")}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => settingQuery.refetch()}>
              {t("appearance:THEME_CONFIG_ACTION_RELOAD")}
            </Button>
            <Button type="button" onClick={onSave} disabled={saveMutation.isPending}>
              {t("appearance:THEME_CONFIG_ACTION_SAVE")}
            </Button>
          </div>
        </div>

        <div className="mt-3 text-sm text-muted-foreground">
          {t("appearance:THEME_CONFIG_FIELD_HELP")}
        </div>

        <div className="mt-3">
          <div className="text-sm text-muted-foreground">
            {t("appearance:THEME_CONFIG_FIELD_LABEL")}
          </div>
          <AntInput.TextArea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            autoSize={{ minRows: 14, maxRows: 28 }}
          />
          {jsonError ? <div className="mt-2 text-sm text-destructive">{jsonError}</div> : null}
        </div>
      </PageState>
    </DefaultPage>
  );
}
