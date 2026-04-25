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
import { useTranslation } from "react-i18next";

import type { ContentLibraryTableRow } from "../types";

type ContentLibraryDialogState = {
  row: ContentLibraryTableRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

type ContentLibraryArchiveDialogState = ContentLibraryDialogState & {
  mode: "archive" | "unarchive";
};

type ContentLibraryBulkDialogState = {
  count: number;
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function ContentLibraryConfirmDialog(props: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
}) {
  const { t } = useTranslation("content");

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

export function ContentLibraryActionDialogs(props: {
  duplicateDialog: ContentLibraryDialogState;
  deleteDialog: ContentLibraryDialogState;
  archiveDialog: ContentLibraryArchiveDialogState;
  bulkArchiveDialog: ContentLibraryBulkDialogState;
  bulkDeleteDialog: ContentLibraryBulkDialogState;
  bulkPublishDialog: ContentLibraryBulkDialogState;
  bulkUnpublishDialog: ContentLibraryBulkDialogState;
}) {
  const { t } = useTranslation("content");
  const archiveTitle =
    props.archiveDialog.mode === "unarchive"
      ? t("CONTENT_LIBRARY_UNARCHIVE_DIALOG_TITLE")
      : t("CONTENT_LIBRARY_ARCHIVE_DIALOG_TITLE");
  const archiveDescription =
    props.archiveDialog.mode === "unarchive"
      ? t("CONTENT_LIBRARY_UNARCHIVE_DIALOG_DESC", {
          name: props.archiveDialog.row?.name ?? "",
        })
      : t("CONTENT_LIBRARY_ARCHIVE_DIALOG_DESC", {
          name: props.archiveDialog.row?.name ?? "",
        });
  const archiveConfirmLabel =
    props.archiveDialog.mode === "unarchive"
      ? t("CONTENT_LIBRARY_ACTION_UNARCHIVE")
      : t("CONTENT_LIBRARY_ACTION_ARCHIVE");
  const archiveConfirmVariant =
    props.archiveDialog.mode === "unarchive" ? "default" : "destructive";

  return (
    <>
      <ContentLibraryConfirmDialog
        open={Boolean(props.duplicateDialog.row)}
        pending={props.duplicateDialog.pending}
        onOpenChange={props.duplicateDialog.onOpenChange}
        onConfirm={props.duplicateDialog.onConfirm}
        title={t("CONTENT_LIBRARY_DUPLICATE_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_DUPLICATE_DIALOG_DESC", {
          name: props.duplicateDialog.row?.name ?? "",
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_DUPLICATE")}
      />
      <ContentLibraryConfirmDialog
        open={Boolean(props.deleteDialog.row)}
        pending={props.deleteDialog.pending}
        onOpenChange={props.deleteDialog.onOpenChange}
        onConfirm={props.deleteDialog.onConfirm}
        title={t("CONTENT_LIBRARY_DELETE_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_DELETE_DIALOG_DESC", {
          name: props.deleteDialog.row?.name ?? "",
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_DELETE")}
        confirmVariant="destructive"
      />
      <ContentLibraryConfirmDialog
        open={Boolean(props.archiveDialog.row)}
        pending={props.archiveDialog.pending}
        onOpenChange={props.archiveDialog.onOpenChange}
        onConfirm={props.archiveDialog.onConfirm}
        title={archiveTitle}
        description={archiveDescription}
        confirmLabel={archiveConfirmLabel}
        confirmVariant={archiveConfirmVariant}
      />
      <ContentLibraryConfirmDialog
        open={props.bulkPublishDialog.open}
        pending={props.bulkPublishDialog.pending}
        onOpenChange={props.bulkPublishDialog.onOpenChange}
        onConfirm={props.bulkPublishDialog.onConfirm}
        title={t("CONTENT_LIBRARY_BULK_PUBLISH_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_BULK_PUBLISH_DIALOG_DESC", {
          count: props.bulkPublishDialog.count,
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_BULK_PUBLISH")}
      />
      <ContentLibraryConfirmDialog
        open={props.bulkUnpublishDialog.open}
        pending={props.bulkUnpublishDialog.pending}
        onOpenChange={props.bulkUnpublishDialog.onOpenChange}
        onConfirm={props.bulkUnpublishDialog.onConfirm}
        title={t("CONTENT_LIBRARY_BULK_UNPUBLISH_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_BULK_UNPUBLISH_DIALOG_DESC", {
          count: props.bulkUnpublishDialog.count,
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_BULK_UNPUBLISH")}
      />
      <ContentLibraryConfirmDialog
        open={props.bulkArchiveDialog.open}
        pending={props.bulkArchiveDialog.pending}
        onOpenChange={props.bulkArchiveDialog.onOpenChange}
        onConfirm={props.bulkArchiveDialog.onConfirm}
        title={t("CONTENT_LIBRARY_BULK_ARCHIVE_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_BULK_ARCHIVE_DIALOG_DESC", {
          count: props.bulkArchiveDialog.count,
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_ARCHIVE")}
        confirmVariant="destructive"
      />
      <ContentLibraryConfirmDialog
        open={props.bulkDeleteDialog.open}
        pending={props.bulkDeleteDialog.pending}
        onOpenChange={props.bulkDeleteDialog.onOpenChange}
        onConfirm={props.bulkDeleteDialog.onConfirm}
        title={t("CONTENT_LIBRARY_BULK_DELETE_DIALOG_TITLE")}
        description={t("CONTENT_LIBRARY_BULK_DELETE_DIALOG_DESC", {
          count: props.bulkDeleteDialog.count,
        })}
        confirmLabel={t("CONTENT_LIBRARY_ACTION_DELETE")}
        confirmVariant="destructive"
      />
    </>
  );
}
