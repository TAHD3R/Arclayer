import { Copy, Trash2 } from "lucide-react";

import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";

type ContentModelsSelectionToolbarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedCount: number;
  canManageModels?: boolean;
  duplicatePending?: boolean;
  deletePending?: boolean;
  onClearSelection: () => void;
  onOpenDuplicate: () => void;
  onOpenDelete: () => void;
};

export function ContentModelsSelectionToolbar(props: ContentModelsSelectionToolbarProps) {
  const actionsDisabled = props.canManageModels === false;

  return (
    <FloatingBulkToolbar
      visible={props.selectedCount > 0}
      selectedLabel={props.t("content:CONTENT_MODELS_SELECTED_COUNT", {
        count: props.selectedCount,
      })}
      clearLabel={props.t("common:DATA_TABLE_CLEAR_SELECTION")}
      onClear={props.onClearSelection}
      actions={[
        {
          key: "duplicate",
          label: props.t("common:DUPLICATE"),
          icon: <Copy className="size-4" />,
          onClick: props.onOpenDuplicate,
          disabled: props.duplicatePending || actionsDisabled,
        },
        {
          key: "delete",
          label: props.t("common:DELETE"),
          icon: <Trash2 className="size-4" />,
          onClick: props.onOpenDelete,
          disabled: props.deletePending || actionsDisabled,
          variant: "destructive",
        },
      ]}
    />
  );
}
