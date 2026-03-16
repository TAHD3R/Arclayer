import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { AlertDialogCancel as AlertDialogCancelPrimitive } from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";

export type FolderNotEmptyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  hasAssets: boolean;
  hasChildren: boolean;
};

export function FolderNotEmptyDialog(props: FolderNotEmptyDialogProps) {
  const { t } = useTranslation();

  const reason = (() => {
    if (props.hasAssets && props.hasChildren) return t("assets:ASSET_FOLDER_DELETE_BLOCKED_BOTH");
    if (props.hasAssets) return t("assets:ASSET_FOLDER_DELETE_BLOCKED_ASSETS");
    if (props.hasChildren) return t("assets:ASSET_FOLDER_DELETE_BLOCKED_CHILDREN");
    return t("assets:ASSET_FOLDER_DELETE_BLOCKED_GENERIC");
  })();

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("assets:ASSET_FOLDER_DELETE_BLOCKED_TITLE", { name: props.folderName })}
          </AlertDialogTitle>
          <AlertDialogDescription>{reason}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-6">
          <AlertDialogCancelPrimitive asChild>
            <Button>{t("common:CONFIRM")}</Button>
          </AlertDialogCancelPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
