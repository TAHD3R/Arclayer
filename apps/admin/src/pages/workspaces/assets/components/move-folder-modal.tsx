import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";
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
import { FolderParentField, ROOT_FOLDER_VALUE } from "./folder-parent-field";

export type MoveFolderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: AdminAssetFolder | null;
  folders: AdminAssetFolder[];
  foldersLoading?: boolean;
  confirmLoading?: boolean;
  onMove: (parentId: string | null) => Promise<void> | void;
};

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
  const [target, setTarget] = useState<string>(ROOT_FOLDER_VALUE);

  useEffect(() => {
    if (!props.open) return;
    const currentParent = props.folder?.parentId
      ? String(props.folder.parentId)
      : ROOT_FOLDER_VALUE;
    setTarget(currentParent || ROOT_FOLDER_VALUE);
  }, [props.folder?.parentId, props.open]);

  const excludedIds = useMemo(() => {
    const rootId = props.folder?.id ? String(props.folder.id) : "";
    if (!rootId) return new Set<string>();
    return collectDescendantFolderIds({ rootId, folders: props.folders });
  }, [props.folder?.id, props.folders]);

  const disabled = Boolean(props.confirmLoading) || !props.folder;
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    const currentParent = props.folder?.parentId
      ? String(props.folder.parentId)
      : ROOT_FOLDER_VALUE;
    return target !== (currentParent || ROOT_FOLDER_VALUE);
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

        <div className="py-2">
          <FolderParentField
            title={t("assets:ASSET_FOLDER_MOVE_FIELD_TARGET")}
            description={t("assets:ASSET_FOLDER_MOVE_FIELD_TARGET_HELP")}
            placeholder={t("assets:ASSET_FOLDER_MOVE_PLACEHOLDER")}
            rootLabel={t("assets:ASSET_FOLDER_MOVE_TARGET_ROOT")}
            folders={props.folders}
            value={target}
            onValueChange={setTarget}
            disabled={props.foldersLoading}
            excludedFolderIds={excludedIds}
          />
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
                const parentId = target === ROOT_FOLDER_VALUE ? null : target;
                await props.onMove(parentId);
                props.onOpenChange(false);
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
