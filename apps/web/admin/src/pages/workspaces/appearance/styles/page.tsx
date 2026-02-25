import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Input } from "antd";

import { getWorkspaceSiteStyle, upsertWorkspaceSiteStyle } from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceGlobalStylesView() {
  const { t } = useTranslation(["appearance", "nav", "common"]);
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const queryKey = ["workspace", "site", "style", workspaceId] as const;

  const styleQuery = useQuery({
    queryKey,
    enabled: Boolean(workspaceId),
    queryFn: () => getWorkspaceSiteStyle(String(workspaceId)),
    staleTime: 60_000,
  });

  // Sync fetched data into local editor state
  useEffect(() => {
    if (!styleQuery.data) return;
    setJsonText(JSON.stringify(styleQuery.data.value ?? {}, null, 2));
    setJsonError(null);
  }, [styleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      upsertWorkspaceSiteStyle(String(workspaceId), { value }),
    onSuccess: async () => {
      notifySuccessText(t("appearance:GLOBAL_STYLES_SAVE_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: notifyError,
  });

  const handleJsonChange = useCallback(
    (value: string) => {
      setJsonText(value);
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch {
        setJsonError(t("appearance:THEME_CONFIG_JSON_INVALID"));
      }
    },
    [t],
  );

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      saveMutation.mutate(parsed);
    } catch {
      setJsonError(t("appearance:THEME_CONFIG_JSON_INVALID"));
    }
  }, [jsonText, saveMutation, t]);

  const handleReset = useCallback(() => {
    if (!styleQuery.data) return;
    setJsonText(JSON.stringify(styleQuery.data.value ?? {}, null, 2));
    setJsonError(null);
  }, [styleQuery.data]);

  return (
    <DefaultPage
      title={t("nav:NAV_APPEARANCE_STYLES")}
      description={t("appearance:GLOBAL_STYLES_DESC")}
    >
      <ContentGuard
        loading={styleQuery.isLoading && !styleQuery.data}
        loadingVariant="form"
        error={styleQuery.isError ? styleQuery.error : null}
        onRetry={styleQuery.isError ? () => void styleQuery.refetch() : undefined}
      >
        <div className="flex flex-col gap-4">
          {/* JSON editor card */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 font-semibold">{t("appearance:GLOBAL_STYLES_CARD_TITLE")}</h3>

            <label className="mb-1 block text-footnote font-medium">
              {t("appearance:GLOBAL_STYLES_JSON_LABEL")}
            </label>
            <Input.TextArea
              rows={12}
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder={t("appearance:GLOBAL_STYLES_JSON_PLACEHOLDER")}
              status={jsonError ? "error" : undefined}
              className="font-mono text-footnote"
            />
            {jsonError ? <p className="mt-1 text-caption text-destructive">{jsonError}</p> : null}

            <div className="mt-4 flex gap-2">
              <Button onClick={handleReset} disabled={saveMutation.isPending}>
                {t("appearance:GLOBAL_STYLES_ACTION_RESET")}
              </Button>
              <Button
                type="primary"
                loading={saveMutation.isPending}
                disabled={Boolean(jsonError)}
                onClick={handleSave}
              >
                {t("appearance:GLOBAL_STYLES_ACTION_APPLY")}
              </Button>
            </div>
          </div>

          {/* Precedence info */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="mb-2 font-semibold">{t("appearance:GLOBAL_STYLES_PRECEDENCE_TITLE")}</h3>
            <p className="text-footnote text-label-secondary">
              {t("appearance:GLOBAL_STYLES_PRECEDENCE_DESC")}
            </p>
          </div>
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
