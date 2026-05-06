import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

export type MoveAssetsToFolderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: AdminAssetFolder[];
  foldersLoading?: boolean;
  assetCount: number;
  onMove: (folderId: string | null) => Promise<void> | void;
  confirmLoading?: boolean;
};

type FolderOption = { value: string; label: string };

const ROOT_VALUE = "__root__";

function buildFolderPathLabel(params: {
  folderId: string;
  folderById: Map<string, AdminAssetFolder>;
}): string {
  const folder = params.folderById.get(params.folderId);
  if (!folder) return params.folderId;

  const names: string[] = [];
  let cur: AdminAssetFolder | undefined = folder;
  // Cap to 10 levels to avoid infinite loops if parentId data is malformed (backend should ensure no cycles).
  for (let i = 0; i < 10 && cur; i += 1) {
    names.push(cur.name);
    const parentIdValue: string = cur.parentId ? String(cur.parentId) : "";
    cur = parentIdValue ? params.folderById.get(parentIdValue) : undefined;
  }
  return names.reverse().join(" / ");
}

export function MoveAssetsToFolderModal(props: MoveAssetsToFolderModalProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string>(ROOT_VALUE);

  useEffect(() => {
    if (!props.open) return;
    setTarget(ROOT_VALUE);
  }, [props.open]);

  const folderById = useMemo(() => {
    const mp = new Map<string, AdminAssetFolder>();
    for (const f of props.folders) mp.set(String(f.id), f);
    return mp;
  }, [props.folders]);

  const options = useMemo<FolderOption[]>(() => {
    const out: FolderOption[] = [{ value: ROOT_VALUE, label: t("assets:ASSET_MOVE_TARGET_ROOT") }];
    const folderOptions = props.folders.map((f) => ({
      value: String(f.id),
      label: buildFolderPathLabel({ folderId: String(f.id), folderById }),
    }));
    folderOptions.sort((a, b) => a.label.localeCompare(b.label));
    out.push(...folderOptions);
    return out;
  }, [folderById, props.folders, t]);

  const disabled = props.assetCount <= 0 || Boolean(props.confirmLoading);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("assets:ASSET_BULK_MOVE_TITLE", { count: props.assetCount })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("assets:ASSET_BULK_MOVE_DESC")}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <SettingDialogField
            title={t("assets:ASSET_BULK_MOVE_FIELD_TARGET")}
            description={t("assets:ASSET_BULK_MOVE_FIELD_TARGET_HELP")}
          >
            <Select value={target} onValueChange={setTarget} disabled={props.foldersLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("assets:ASSET_BULK_MOVE_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="ghost" disabled={Boolean(props.confirmLoading)}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button
              loading={props.confirmLoading}
              disabled={disabled}
              onClick={async () => {
                const folderId = target === ROOT_VALUE ? null : target;
                await props.onMove(folderId);
                props.onOpenChange(false);
              }}
            >
              {t("assets:ASSET_BULK_MOVE_CONFIRM")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
