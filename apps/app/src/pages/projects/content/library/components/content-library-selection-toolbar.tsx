import { Archive, RotateCcw, Send, Trash2 } from "lucide-react";

import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";

type ContentLibrarySelectionToolbarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedCount: number;
  canManageContent?: boolean;
  archivePending?: boolean;
  deletePending?: boolean;
  publishPending?: boolean;
  unpublishPending?: boolean;
  onClearSelection: () => void;
  onOpenArchive: () => void;
  onOpenDelete: () => void;
  onOpenPublish: () => void;
  onOpenUnpublish: () => void;
};

export function ContentLibrarySelectionToolbar(props: ContentLibrarySelectionToolbarProps) {
  const actionsDisabled = props.canManageContent === false;

  return (
    <FloatingBulkToolbar
      visible={props.selectedCount > 0}
      selectedLabel={props.t("content:CONTENT_LIBRARY_SELECTED_COUNT", {
        count: props.selectedCount,
      })}
      clearLabel={props.t("common:DATA_TABLE_CLEAR_SELECTION")}
      onClear={props.onClearSelection}
      actions={[
        {
          key: "publish",
          label: props.t("content:CONTENT_LIBRARY_ACTION_BULK_PUBLISH"),
          icon: <Send className="size-4" />,
          onClick: props.onOpenPublish,
          disabled: props.publishPending || actionsDisabled,
        },
        {
          key: "unpublish",
          label: props.t("content:CONTENT_LIBRARY_ACTION_BULK_UNPUBLISH"),
          icon: <RotateCcw className="size-4" />,
          onClick: props.onOpenUnpublish,
          disabled: props.unpublishPending || actionsDisabled,
        },
        {
          key: "archive",
          label: props.t("content:CONTENT_LIBRARY_ACTION_ARCHIVE"),
          icon: <Archive className="size-4" />,
          onClick: props.onOpenArchive,
          disabled: props.archivePending || actionsDisabled,
        },
        {
          key: "delete",
          label: props.t("content:CONTENT_LIBRARY_ACTION_DELETE"),
          icon: <Trash2 className="size-4" />,
          onClick: props.onOpenDelete,
          disabled: props.deletePending || actionsDisabled,
          variant: "destructive",
        },
      ]}
    />
  );
}
