import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@celestial/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@celestial/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@celestial/ui/button";

export type BulkDeleteAssetsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetCount: number;
  confirmLoading?: boolean;
  onConfirm: () => Promise<void> | void;
};

export function BulkDeleteAssetsDialog(props: BulkDeleteAssetsDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("assets:ASSET_BULK_DELETE_CONFIRM_TITLE", { count: props.assetCount })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("assets:ASSET_BULK_DELETE_CONFIRM_DESC")}
          </AlertDialogDescription>
        </AlertDialogHeader>

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
              disabled={props.assetCount <= 0}
              onClick={async () => {
                await props.onConfirm();
              }}
            >
              {t("assets:ASSET_BULK_DELETE_CONFIRM")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
