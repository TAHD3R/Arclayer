import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";
import { FolderParentField, ROOT_FOLDER_VALUE } from "./folder-parent-field";

export type CreateAssetFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: AdminAssetFolder[];
  initialParentId: string | null;
  parentLabel?: string;
  confirmLoading?: boolean;
  foldersLoading?: boolean;
  assetCount?: number;
  onCreate: (value: {
    name: string;
    description: string | null;
    parentId: string | null;
  }) => Promise<void> | void;
};

export function CreateAssetFolderDialog(props: CreateAssetFolderDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>(ROOT_FOLDER_VALUE);

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
    setParentId(props.initialParentId ?? ROOT_FOLDER_VALUE);
  }, [props.initialParentId, props.open]);

  const disabled = Boolean(props.confirmLoading);
  const canSubmit = name.trim().length > 0 && !disabled;
  const hasSeedAssets = (props.assetCount ?? 0) > 0;
  const effectiveParentLabel = useMemo(() => {
    if (parentId === ROOT_FOLDER_VALUE) return null;
    return (
      props.folders.find((folder) => String(folder.id) === parentId)?.name ??
      props.parentLabel ??
      null
    );
  }, [parentId, props.folders, props.parentLabel]);
  const dialogDescription = hasSeedAssets
    ? effectiveParentLabel
      ? t("assets:ASSET_FOLDER_CREATE_AND_MOVE_DESC_IN", {
          parent: effectiveParentLabel,
          count: props.assetCount,
        })
      : t("assets:ASSET_FOLDER_CREATE_AND_MOVE_DESC", { count: props.assetCount })
    : effectiveParentLabel
      ? t("assets:ASSET_FOLDER_CREATE_DESC_IN", { parent: effectiveParentLabel })
      : t("assets:ASSET_FOLDER_CREATE_DESC");

  const submit = async () => {
    await props.onCreate({
      name: name.trim(),
      description: description.trim() || null,
      parentId: parentId === ROOT_FOLDER_VALUE ? null : parentId,
    });
    props.onOpenChange(false);
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("assets:ASSET_FOLDER_CREATE_TITLE")}
      description={dialogDescription}
      footer={
        <>
          <Button variant="ghost" disabled={disabled} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.confirmLoading} disabled={!canSubmit} onClick={submit}>
            {hasSeedAssets
              ? t("assets:ASSET_FOLDER_CREATE_AND_MOVE_CONFIRM")
              : t("assets:ASSET_FOLDER_CREATE_CONFIRM")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField
          title={t("assets:ASSET_FOLDER_NAME")}
          description={t("assets:ASSET_FOLDER_FIELD_NAME_HELP")}
        >
          <Input
            autoFocus
            disabled={disabled}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_CREATE_PLACEHOLDER")}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!canSubmit) return;
              void submit();
            }}
          />
        </SettingDialogField>

        <FolderParentField
          title={t("assets:ASSET_FOLDER_CREATE_FIELD_PARENT")}
          description={t("assets:ASSET_FOLDER_CREATE_FIELD_PARENT_HELP")}
          placeholder={t("assets:ASSET_FOLDER_CREATE_PARENT_PLACEHOLDER")}
          rootLabel={t("assets:ASSET_FOLDER_MOVE_TARGET_ROOT")}
          folders={props.folders}
          value={parentId}
          onValueChange={setParentId}
          disabled={props.foldersLoading || disabled}
        />

        <SettingDialogField
          title={t("assets:ASSET_FOLDER_DESCRIPTION")}
          description={t("assets:ASSET_FOLDER_FIELD_DESCRIPTION_HELP")}
        >
          <Textarea
            className="min-h-24"
            disabled={disabled}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_DESCRIPTION_PLACEHOLDER")}
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}
