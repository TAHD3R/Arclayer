import { Button as AntButton } from "antd";

import { SettingDialog } from "@/components/settings-primitives/setting-dialog";

import type { ContentPageRow } from "../types";
import { resolveDisplayName } from "../utils";

type ContentPagesConfirmDialogsProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  duplicateRow: ContentPageRow | null;
  duplicateLoading: boolean;
  onCloseDuplicate: () => void;
  onConfirmDuplicate: () => void;
  deleteRows: ContentPageRow[] | null;
  deleteLoading: boolean;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
};

function resolveDeleteDescription(
  t: ContentPagesConfirmDialogsProps["t"],
  rows: ContentPageRow[] | null,
): string | undefined {
  if (!rows || rows.length === 0) return undefined;
  if (rows.length === 1) {
    return t("content_pages:CONFIRM_DELETE_SINGLE", {
      name: resolveDisplayName(rows[0]),
    });
  }
  return t("content_pages:CONFIRM_DELETE_BULK", { count: rows.length });
}

export function ContentPagesConfirmDialogs(props: ContentPagesConfirmDialogsProps) {
  const duplicateName = props.duplicateRow ? resolveDisplayName(props.duplicateRow) : "";
  const deleteDescription = resolveDeleteDescription(props.t, props.deleteRows);

  return (
    <>
      <SettingDialog
        open={Boolean(props.duplicateRow)}
        onOpenChange={(open) => {
          if (!open) props.onCloseDuplicate();
        }}
        title={props.t("content_pages:DIALOG_DUPLICATE_TITLE")}
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              type="text"
              onClick={props.onCloseDuplicate}
              disabled={props.duplicateLoading}
            >
              {props.t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={props.duplicateLoading}
              onClick={props.onConfirmDuplicate}
            >
              {props.t("content_pages:DIALOG_DUPLICATE_ACTION")}
            </AntButton>
          </>
        }
      >
        <div className="text-label-secondary">
          {props.t("content_pages:DIALOG_DUPLICATE_DESC", { name: duplicateName })}
        </div>
      </SettingDialog>

      <SettingDialog
        open={Boolean(props.deleteRows && props.deleteRows.length > 0)}
        onOpenChange={(open) => {
          if (!open) props.onCloseDelete();
        }}
        title={props.t("content_pages:DIALOG_DELETE_TITLE")}
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton type="text" onClick={props.onCloseDelete} disabled={props.deleteLoading}>
              {props.t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              danger
              loading={props.deleteLoading}
              onClick={props.onConfirmDelete}
            >
              {props.t("content_pages:DIALOG_DELETE_ACTION")}
            </AntButton>
          </>
        }
      >
        <div className="text-label-secondary">{deleteDescription}</div>
      </SettingDialog>
    </>
  );
}
