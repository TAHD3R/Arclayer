import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";

export type CreateAssetFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentLabel?: string;
  confirmLoading?: boolean;
  assetCount?: number;
  onCreate: (name: string, description: string | null) => Promise<void> | void;
};

export function CreateAssetFolderDialog(props: CreateAssetFolderDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
  }, [props.open]);

  const canSubmit = name.trim().length > 0 && !props.confirmLoading;
  const hasSeedAssets = (props.assetCount ?? 0) > 0;
  const dialogDescription = hasSeedAssets
    ? props.parentLabel
      ? t("assets:ASSET_FOLDER_CREATE_AND_MOVE_DESC_IN", {
          parent: props.parentLabel,
          count: props.assetCount,
        })
      : t("assets:ASSET_FOLDER_CREATE_AND_MOVE_DESC", { count: props.assetCount })
    : props.parentLabel
      ? t("assets:ASSET_FOLDER_CREATE_DESC_IN", { parent: props.parentLabel })
      : t("assets:ASSET_FOLDER_CREATE_DESC");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("assets:ASSET_FOLDER_CREATE_TITLE")}
      description={dialogDescription}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={Boolean(props.confirmLoading)}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              await props.onCreate(name.trim(), description.trim() || null);
              props.onOpenChange(false);
            }}
          >
            {hasSeedAssets
              ? t("assets:ASSET_FOLDER_CREATE_AND_MOVE_CONFIRM")
              : t("assets:ASSET_FOLDER_CREATE_CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("assets:ASSET_FOLDER_NAME")}</label>
          <div className="text-label-secondary">{t("assets:ASSET_FOLDER_FIELD_NAME_HELP")}</div>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_CREATE_PLACEHOLDER")}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!canSubmit) return;
              void (async () => {
                await props.onCreate(name.trim(), description.trim() || null);
                props.onOpenChange(false);
              })();
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("assets:ASSET_FOLDER_DESCRIPTION")}
          </label>
          <div className="text-label-secondary">
            {t("assets:ASSET_FOLDER_FIELD_DESCRIPTION_HELP")}
          </div>
          <Textarea
            className="min-h-24"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_DESCRIPTION_PLACEHOLDER")}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
