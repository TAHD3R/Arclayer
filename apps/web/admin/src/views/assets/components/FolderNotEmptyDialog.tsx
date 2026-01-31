import { Button } from "antd";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/animate-ui/components/radix/alert-dialog";
import { AlertDialogCancel as AlertDialogCancelPrimitive } from "@/components/animate-ui/primitives/radix/alert-dialog";

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
          <AlertDialogTitle className="font-bold! text-xl">
            {t("assets:ASSET_FOLDER_DELETE_BLOCKED_TITLE", { name: props.folderName })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">{reason}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-6">
          <AlertDialogCancelPrimitive asChild>
            <Button type="primary">{t("common:CONFIRM")}</Button>
          </AlertDialogCancelPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
