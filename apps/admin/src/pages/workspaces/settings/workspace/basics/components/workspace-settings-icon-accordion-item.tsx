import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

export function WorkspaceSettingsIconAccordionItem(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const { t: tGlobal } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const iconUrl = String(c.currentWorkspaceIconUrl || "").trim();
  const iconPreviewUrl = resolvePublicAssetUrlPath(iconUrl);

  return (
    <SettingAccordionItem
      value="workspace_icon"
      variant="action"
      title={t("settings:SETTINGS_WORKSPACE_ICON_LABEL")}
      description={t("settings:SETTINGS_WORKSPACE_ICON_ITEM_DESC")}
      showSummary
      summary={iconUrl}
      placeholder={t("settings:SETTINGS_NOT_SET")}
      keepRendered
      disabled={c.disabled || !c.detailQuery.data}
      confirmText={t("settings:SETTINGS_SAVE")}
      confirmLoading={c.savingKey === "workspace:icon"}
      onConfirm={() =>
        void c.withSavingKey("workspace:icon", async () => {
          const raw = String(c.form.getValues("iconUrl") || "").trim();
          await c.patchWorkspaceMutation.mutateAsync({ iconUrl: raw || null });
        })
      }
      onReset={
        c.isWorkspaceIconDirty && c.detailQuery.data
          ? () =>
              void c.withSavingKey("reset:workspace:icon", async () => {
                c.form.setValue("iconUrl", c.initialWorkspaceIconUrl, { shouldDirty: false });
                const raw = String(c.initialWorkspaceIconUrl || "").trim();
                await c.patchWorkspaceMutation.mutateAsync({ iconUrl: raw || null });
              })
          : undefined
      }
      resetText={t("settings:SETTINGS_RESET")}
      resetLoading={c.savingKey === "reset:workspace:icon"}
    >
      <AvatarUploadSlot
        src={iconPreviewUrl}
        fallback={
          <span className="text-caption text-label-secondary">
            {t("settings:SETTINGS_NOT_SET")}
          </span>
        }
        shape="square"
        size={80}
        disabled={c.disabled || !c.detailQuery.data}
        loading={isUploading}
        uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
        removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
        canRemove={Boolean(iconUrl)}
        onPick={() => fileInputRef.current?.click()}
        onRemove={() => c.form.setValue("iconUrl", "", { shouldDirty: true })}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (!file) return;
          if (!file.type?.startsWith("image/")) {
            notifyError(new Error(tGlobal("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
            return;
          }

          setIsUploading(true);
          uploadSingleAssetFromFile({
            scope: { type: "workspace", id: c.workspaceId },
            purpose: "workspace_icon",
            file,
            t: tGlobal,
          })
            .then((assetId) => {
              c.form.setValue("iconUrl", `/assets/${assetId}`, { shouldDirty: true });
              notifySuccessText(tGlobal("assets:ASSET_UPLOAD_SUCCESS"));
            })
            .catch((error) => notifyError(error))
            .finally(() => setIsUploading(false));
        }}
      />
    </SettingAccordionItem>
  );
}
