import { FolderInput, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminAssetFolder } from "@/types/api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import {
  buildChildrenByParent,
  buildFolderById,
  buildFolderPath,
} from "./assets-folder-rail-utils";

export type DeleteAssetFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: AdminAssetFolder | null;
  folders: AdminAssetFolder[];
  confirmLoading?: boolean;
  onConfirm: (destinationFolderId: string | null) => Promise<void>;
};

type DeleteStrategy = "root" | "folder";

function buildFolderPathLabel(folderId: string, folderById: Map<string, AdminAssetFolder>): string {
  const names = buildFolderPath(folderId, folderById).map((folder) => folder.name);
  return names.join(" / ") || folderId;
}

function collectDescendantIds(folderId: string, folders: AdminAssetFolder[]): Set<string> {
  const childrenByParent = buildChildrenByParent(folders);
  const out = new Set<string>();
  const stack = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || out.has(current)) continue;
    out.add(current);
    const children = childrenByParent.get(current) ?? [];
    children.forEach((child) => stack.push(String(child.id)));
  }

  return out;
}

export function DeleteAssetFolderDialog(props: DeleteAssetFolderDialogProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<DeleteStrategy>("root");
  const [target, setTarget] = useState<string>("");

  useEffect(() => {
    if (!props.open) return;
    setStrategy("root");
    setTarget("");
  }, [props.open, props.folder?.id]);

  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const options = useMemo(() => {
    if (!props.folder) return [] as Array<{ value: string; label: string }>;
    const blockedIds = collectDescendantIds(String(props.folder.id), props.folders);

    return props.folders
      .filter((candidate) => !blockedIds.has(String(candidate.id)))
      .map((candidate) => ({
        value: String(candidate.id),
        label: buildFolderPathLabel(String(candidate.id), folderById),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folderById, props.folder, props.folders]);

  const confirmDisabled =
    !props.folder || Boolean(props.confirmLoading) || (strategy === "folder" && !target);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {props.folder
              ? t("assets:ASSET_FOLDER_DELETE_TITLE", { name: props.folder.name })
              : t("assets:ASSET_ACTION_DELETE_FOLDER")}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("assets:ASSET_FOLDER_DELETE_DESC")}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-2">
          <RadioGroup
            value={strategy}
            onValueChange={(value) => setStrategy(value === "folder" ? "folder" : "root")}
            className="gap-3"
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-1">
              <RadioGroupItem value="root" className="mt-1" />
              <div className="space-y-1">
                <div className="text-callout font-semibold text-label-primary">
                  {t("assets:ASSET_FOLDER_DELETE_OPTION_ROOT")}
                </div>
                <div className="text-footnote text-label-secondary">
                  {t("assets:ASSET_FOLDER_DELETE_OPTION_ROOT_DESC")}
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-1">
              <RadioGroupItem value="folder" className="mt-1" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <div className="text-callout font-semibold text-label-primary">
                    {t("assets:ASSET_FOLDER_DELETE_OPTION_FOLDER")}
                  </div>
                  <div className="text-footnote text-label-secondary">
                    {t("assets:ASSET_FOLDER_DELETE_OPTION_FOLDER_DESC")}
                  </div>
                </div>
                <Select
                  value={target || undefined}
                  onValueChange={setTarget}
                  disabled={strategy !== "folder" || props.confirmLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("assets:ASSET_FOLDER_DELETE_PLACEHOLDER")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="max-h-80">
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </label>
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="ghost" disabled={Boolean(props.confirmLoading)}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button
              variant="destructive"
              loading={props.confirmLoading}
              disabled={confirmDisabled}
              onClick={async () => {
                const destinationFolderId = strategy === "folder" ? target : null;
                await props.onConfirm(destinationFolderId);
                props.onOpenChange(false);
              }}
            >
              {strategy === "folder" ? (
                <FolderInput className="size-4" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {t("assets:ASSET_FOLDER_DELETE_CONFIRM")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
