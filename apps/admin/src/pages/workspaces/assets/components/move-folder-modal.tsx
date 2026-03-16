import { FolderInput } from "lucide-react";
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
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type MoveFolderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: AdminAssetFolder | null;
  folders: AdminAssetFolder[];
  foldersLoading?: boolean;
  confirmLoading?: boolean;
  onMove: (parentId: string | null) => Promise<void> | void;
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
  // Cap to 10 levels to avoid infinite loops if parentId data is malformed.
  for (let i = 0; i < 10 && cur; i += 1) {
    names.push(cur.name);
    const parentIdValue: string = cur.parentId ? String(cur.parentId) : "";
    cur = parentIdValue ? params.folderById.get(parentIdValue) : undefined;
  }
  return names.reverse().join(" / ");
}

function collectDescendantFolderIds(params: {
  rootId: string;
  folders: AdminAssetFolder[];
}): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const f of params.folders) {
    const pid = f.parentId ? String(f.parentId) : "";
    const fid = String(f.id);
    if (!pid) continue;
    childrenByParent.set(pid, [...(childrenByParent.get(pid) || []), fid]);
  }

  const out = new Set<string>();
  const stack: string[] = [params.rootId];
  for (let guard = 0; guard < 5000 && stack.length; guard += 1) {
    const cur = stack.pop();
    if (!cur) continue;
    if (out.has(cur)) continue;
    out.add(cur);
    const children = childrenByParent.get(cur) || [];
    for (const c of children) stack.push(c);
  }
  return out;
}

export function MoveFolderModal(props: MoveFolderModalProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string>(ROOT_VALUE);

  useEffect(() => {
    if (!props.open) return;
    const currentParent = props.folder?.parentId ? String(props.folder.parentId) : ROOT_VALUE;
    setTarget(currentParent || ROOT_VALUE);
  }, [props.folder?.parentId, props.open]);

  const folderById = useMemo(() => {
    const mp = new Map<string, AdminAssetFolder>();
    for (const f of props.folders) mp.set(String(f.id), f);
    return mp;
  }, [props.folders]);

  const excludedIds = useMemo(() => {
    const rootId = props.folder?.id ? String(props.folder.id) : "";
    if (!rootId) return new Set<string>();
    return collectDescendantFolderIds({ rootId, folders: props.folders });
  }, [props.folder?.id, props.folders]);

  const options = useMemo<FolderOption[]>(() => {
    const out: FolderOption[] = [
      { value: ROOT_VALUE, label: t("assets:ASSET_FOLDER_MOVE_TARGET_ROOT") },
    ];
    for (const f of props.folders) {
      const fid = String(f.id);
      // Can't move into itself or its descendants (would create a cycle).
      if (excludedIds.has(fid)) continue;
      out.push({
        value: fid,
        label: buildFolderPathLabel({ folderId: fid, folderById }),
      });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [excludedIds, folderById, props.folders, t]);

  const disabled = Boolean(props.confirmLoading) || !props.folder;
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    const currentParent = props.folder?.parentId ? String(props.folder.parentId) : ROOT_VALUE;
    return target !== (currentParent || ROOT_VALUE);
  }, [disabled, props.folder?.parentId, target]);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("assets:ASSET_FOLDER_MOVE_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription>
            {props.folder
              ? t("assets:ASSET_FOLDER_MOVE_DESC", { name: props.folder.name })
              : t("assets:ASSET_FOLDER_MOVE_DESC_FALLBACK")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("assets:ASSET_FOLDER_MOVE_FIELD_TARGET")}
            </label>
            <div className="text-label-secondary">
              {t("assets:ASSET_FOLDER_MOVE_FIELD_TARGET_HELP")}
            </div>
            <Select value={target} onValueChange={setTarget} disabled={props.foldersLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("assets:ASSET_FOLDER_MOVE_PLACEHOLDER")} />
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
              disabled={!canSubmit}
              onClick={async () => {
                const parentId = target === ROOT_VALUE ? null : target;
                await props.onMove(parentId);
                props.onOpenChange(false);
              }}
            >
              <FolderInput className="size-4" aria-hidden="true" />
              {t("common:CONFIRM")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
