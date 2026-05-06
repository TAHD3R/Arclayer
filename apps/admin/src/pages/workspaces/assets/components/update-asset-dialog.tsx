import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";

import { getAssetDetail, moveAsset, patchAsset } from "@/api/assets";
import { assetScopeKey } from "@/lib/assets/asset-scope";
import { invalidateAssetListQueries } from "@/lib/assets/invalidate-asset-list-queries";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import type { AdminAssetFolder, PatchAdminAssetPayload } from "@arclayer/openapi/admin-types";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

const ROOT_FOLDER_VALUE = "__root__";

function normalizeFolderValue(value: string) {
  return value === ROOT_FOLDER_VALUE ? null : value;
}

export type UpdateAssetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  asset: AssetMasonryItem | null;
  folders: AdminAssetFolder[];
};

export function UpdateAssetDialog(props: UpdateAssetDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const scopeKey = useMemo(
    () =>
      props.projectId ? assetScopeKey({ type: "project", id: String(props.projectId) }) : null,
    [props.projectId],
  );
  const [filename, setFilename] = useState("");
  const [folderValue, setFolderValue] = useState(ROOT_FOLDER_VALUE);
  const [altName, setAltName] = useState("");

  const detailQuery = useQuery({
    queryKey: ["assets", "detail", scopeKey, props.asset?.id],
    enabled: props.open && Boolean(props.asset?.id) && Boolean(props.projectId),
    queryFn: async () => {
      if (!props.projectId || !props.asset?.id) throw new Error("ASSET_NOT_SELECTED");
      return getAssetDetail(String(props.projectId), props.asset.id);
    },
    staleTime: 20 * 1000,
  });

  useEffect(() => {
    if (!props.open) return;
    const detail = detailQuery.data;
    setFilename(detail?.originalFilename || props.asset?.name || "");
    setFolderValue(detail?.folderId ? String(detail.folderId) : ROOT_FOLDER_VALUE);
    setAltName(detail?.altName || "");
  }, [detailQuery.data, props.asset?.name, props.open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!props.projectId || !props.asset?.id || !detailQuery.data)
        throw new Error("ASSET_NOT_SELECTED");

      const nextFilename = filename.trim();
      const nextFolderId = normalizeFolderValue(folderValue);
      const nextAltName = altName.trim() || null;
      const payload: PatchAdminAssetPayload = {};

      if (nextFilename !== (detailQuery.data.originalFilename || props.asset.name)) {
        payload.originalFilename = nextFilename;
      }
      if (nextAltName !== (detailQuery.data.altName || null)) {
        payload.altName = nextAltName;
      }

      if (Object.keys(payload).length > 0) {
        await patchAsset(String(props.projectId), props.asset.id, payload);
      }

      if (String(detailQuery.data.folderId || "") !== String(nextFolderId || "")) {
        await moveAsset(String(props.projectId), props.asset.id, { folderId: nextFolderId });
      }
    },
    onSuccess: async () => {
      if (scopeKey) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["assets", "detail", scopeKey, props.asset?.id],
          }),
          invalidateAssetListQueries(queryClient, scopeKey),
          queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] }),
        ]);
      }
      notifySuccessText(t("assets:ASSET_EDIT_SUCCESS"));
      props.onOpenChange(false);
    },
    onError: () => {
      notifyErrorText(t("assets:ASSET_EDIT_FAILED"));
    },
  });

  const disabled = detailQuery.isLoading || saveMutation.isPending;
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    if (!props.asset || !detailQuery.data) return false;
    return filename.trim().length > 0;
  }, [detailQuery.data, disabled, filename, props.asset]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("assets:ASSET_EDIT_TITLE")}
      description={
        props.asset
          ? t("assets:ASSET_EDIT_DESC", { name: props.asset.name })
          : t("assets:ASSET_EDIT_DESC_FALLBACK")
      }
      footer={
        <>
          <Button variant="ghost" disabled={disabled} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={saveMutation.isPending}
            disabled={!canSubmit}
            onClick={() => saveMutation.mutate()}
          >
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField
          title={t("assets:ASSET_EDIT_FILENAME")}
          description={t("assets:ASSET_EDIT_FILENAME_HELP")}
        >
          <Input
            autoFocus
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            placeholder={t("assets:ASSET_EDIT_FILENAME_PLACEHOLDER")}
            disabled={disabled}
          />
        </SettingDialogField>

        <SettingDialogField
          title={t("assets:ASSET_EDIT_FOLDER")}
          description={t("assets:ASSET_EDIT_FOLDER_HELP")}
        >
          <Select value={folderValue} onValueChange={setFolderValue} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("assets:ASSET_EDIT_FOLDER_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value={ROOT_FOLDER_VALUE}>
                {t("assets:ASSET_FOLDER_MOVE_TARGET_ROOT")}
              </SelectItem>
              {props.folders.map((folder) => (
                <SelectItem key={folder.id} value={String(folder.id)}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>

        <SettingDialogField
          title={
            <div className="flex items-center gap-1.5">
              <span>{t("assets:ASSET_EDIT_ALT_NAME")}</span>
              <Tooltip>
                <TooltipTrigger asChild focusTrigger={false}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="inline-flex size-5 items-center justify-center rounded-full text-label-secondary hover:text-label-primary disabled:pointer-events-none disabled:opacity-50"
                    aria-label={t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")}
                  >
                    <CircleHelp className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")}</TooltipContent>
              </Tooltip>
            </div>
          }
          description={t("assets:ASSET_EDIT_ALT_NAME_HELP")}
        >
          <Input
            value={altName}
            onChange={(event) => setAltName(event.target.value)}
            placeholder={t("assets:ASSET_EDIT_ALT_NAME_PLACEHOLDER")}
            disabled={disabled}
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}
