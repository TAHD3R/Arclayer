import { Button, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminAssetFolder } from "@/api/assets";
import { SettingDialog } from "@/components/common/setting-dialog";

export type UpdateAssetFolderDialogValue = {
  name: string;
  description: string | null;
};

export type UpdateAssetFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: AdminAssetFolder | null;
  confirmLoading?: boolean;
  onConfirm: (value: UpdateAssetFolderDialogValue) => Promise<void> | void;
};

export function UpdateAssetFolderDialog(props: UpdateAssetFolderDialogProps) {
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.folder?.name || "");
    setDescription(props.folder?.description || "");
  }, [props.folder?.description, props.folder?.name, props.open]);

  const disabled = Boolean(props.confirmLoading);
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    if (!props.folder) return false;
    return name.trim().length > 0;
  }, [disabled, name, props.folder]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("assets:ASSET_FOLDER_EDIT_TITLE")}
      description={
        props.folder
          ? t("assets:ASSET_FOLDER_EDIT_DESC", { name: props.folder.name })
          : t("assets:ASSET_FOLDER_EDIT_DESC_FALLBACK")
      }
      footer={
        <>
          <Button type="text" disabled={disabled} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              await props.onConfirm({
                name: name.trim(),
                description: description.trim() || null,
              });
              props.onOpenChange(false);
            }}
          >
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="mt-4 space-y-4">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("assets:ASSET_FOLDER_NAME")}</label>
          <div className="text-label-secondary">{t("assets:ASSET_FOLDER_FIELD_NAME_HELP")}</div>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_NAME_PLACEHOLDER")}
            disabled={disabled}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("assets:ASSET_FOLDER_DESCRIPTION")}
          </label>
          <div className="text-label-secondary">
            {t("assets:ASSET_FOLDER_FIELD_DESCRIPTION_HELP")}
          </div>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_DESCRIPTION_PLACEHOLDER")}
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={disabled}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
