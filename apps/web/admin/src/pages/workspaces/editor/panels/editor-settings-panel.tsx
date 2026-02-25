import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useWorkspaceContentStrategy } from "@/pages/workspaces/editor/hooks/use-workspace-content-strategy";

export function EditorSettingsPanel() {
  const { t } = useTranslation(["content_pages"]);
  const navigate = useNavigate();
  const { workspaceId } = useEditorConfig();
  const { policy } = useWorkspaceContentStrategy(workspaceId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title3 font-bold">{t("content_pages:EDITOR_SAVE_SETTINGS_TITLE")}</h2>
        <p className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_SAVE_SETTINGS_WORKSPACE_POLICY_DESC")}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-callout">{t("content_pages:EDITOR_SAVE_SETTINGS_AUTO_SAVE")}</span>
          <span className="text-caption text-label-secondary">
            {policy.autosave.enabled
              ? t("content_pages:EDITOR_STATUS_ENABLED")
              : t("content_pages:EDITOR_STATUS_DISABLED")}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-callout">{t("content_pages:EDITOR_SAVE_SETTINGS_INTERVAL")}</span>
          <span className="text-caption text-label-secondary">{policy.autosave.intervalSec}s</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-callout">
            {t("content_pages:EDITOR_SAVE_SETTINGS_SAVE_ON_BLUR")}
          </span>
          <span className="text-caption text-label-secondary">
            {policy.autosave.saveOnBlur
              ? t("content_pages:EDITOR_STATUS_ENABLED")
              : t("content_pages:EDITOR_STATUS_DISABLED")}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-callout">{t("content_pages:EDITOR_SAVE_SETTINGS_RETENTION")}</span>
          <span className="text-caption text-label-secondary">
            {t("content_pages:EDITOR_SAVE_SETTINGS_RETENTION_VALUE", {
              count: policy.retention.draftMaxRevisions,
            })}
          </span>
        </div>
      </div>

      <Button
        type="primary"
        onClick={() => {
          void navigate({
            to: `/w/${workspaceId}/settings/workspace`,
            search: { index: "content_strategy" },
          });
        }}
      >
        {t("content_pages:EDITOR_SAVE_SETTINGS_OPEN_WORKSPACE_SETTINGS")}
      </Button>
    </div>
  );
}
