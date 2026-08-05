import { useTranslation } from "react-i18next";

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

import type { ContentModelsTableRow } from "../types";

type ContentModelsDialogState = {
  row: ContentModelsTableRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

type ContentModelsBulkDialogState = {
  count: number;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function ContentModelsConfirmDialog(props: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
}) {
  const { t } = useTranslation(["content", "common"]);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="sm:max-w-130">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-body">{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="outline" disabled={props.pending}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button
              variant={props.confirmVariant ?? "default"}
              loading={props.pending}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ContentModelsActionDialogs(props: {
  duplicateDialog: ContentModelsDialogState;
  deleteDialog: ContentModelsDialogState;
  bulkDuplicateDialog: ContentModelsBulkDialogState;
  bulkDeleteDialog: ContentModelsBulkDialogState;
}) {
  const { t } = useTranslation("content");

  return (
    <>
      <ContentModelsConfirmDialog
        open={Boolean(props.duplicateDialog.row)}
        pending={props.duplicateDialog.pending}
        onOpenChange={props.duplicateDialog.onOpenChange}
        onConfirm={props.duplicateDialog.onConfirm}
        title={t("CONTENT_MODELS_DUPLICATE_DIALOG_TITLE")}
        description={t("CONTENT_MODELS_DUPLICATE_DIALOG_DESC", {
          name: props.duplicateDialog.row?.name ?? "",
        })}
        confirmLabel={t("CONTENT_MODELS_DUPLICATE_DIALOG_CONFIRM")}
      />
      <ContentModelsConfirmDialog
        open={Boolean(props.deleteDialog.row)}
        pending={props.deleteDialog.pending}
        onOpenChange={props.deleteDialog.onOpenChange}
        onConfirm={props.deleteDialog.onConfirm}
        title={t("CONTENT_MODELS_DELETE_DIALOG_TITLE")}
        description={t("CONTENT_MODELS_DELETE_DIALOG_DESC", {
          name: props.deleteDialog.row?.name ?? "",
        })}
        confirmLabel={t("CONTENT_MODELS_DELETE_DIALOG_CONFIRM")}
        confirmVariant="destructive"
      />
      <ContentModelsConfirmDialog
        open={props.bulkDuplicateDialog.open}
        pending={props.bulkDuplicateDialog.pending}
        onOpenChange={props.bulkDuplicateDialog.onOpenChange}
        onConfirm={props.bulkDuplicateDialog.onConfirm}
        title={t("CONTENT_MODELS_BULK_DUPLICATE_DIALOG_TITLE")}
        description={t("CONTENT_MODELS_BULK_DUPLICATE_DIALOG_DESC", {
          count: props.bulkDuplicateDialog.count,
        })}
        confirmLabel={t("CONTENT_MODELS_BULK_DUPLICATE_DIALOG_CONFIRM")}
      />
      <ContentModelsConfirmDialog
        open={props.bulkDeleteDialog.open}
        pending={props.bulkDeleteDialog.pending}
        onOpenChange={props.bulkDeleteDialog.onOpenChange}
        onConfirm={props.bulkDeleteDialog.onConfirm}
        title={t("CONTENT_MODELS_BULK_DELETE_DIALOG_TITLE")}
        description={t("CONTENT_MODELS_BULK_DELETE_DIALOG_DESC", {
          count: props.bulkDeleteDialog.count,
        })}
        confirmLabel={t("CONTENT_MODELS_BULK_DELETE_DIALOG_CONFIRM")}
        confirmVariant="destructive"
      />
    </>
  );
}
