import { Button } from "antd";

type ContentPagesBulkActionsProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedCount: number;
  visibilityLoading: boolean;
  duplicateLoading: boolean;
  deleteLoading: boolean;
  onClearSelection: () => void;
  onSetPublic: () => void;
  onSetPrivate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function ContentPagesBulkActions(props: ContentPagesBulkActionsProps) {
  if (props.selectedCount <= 0) return null;

  return (
    <div className="mb-3 rounded-md border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {props.t("content_pages:BULK_SELECTED_COUNT", { count: props.selectedCount })}
          </span>
          <Button type="text" onClick={props.onClearSelection}>
            {props.t("content_pages:BULK_CLEAR_SELECTION")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={props.onSetPublic} loading={props.visibilityLoading}>
            {props.t("content_pages:BULK_SET_PUBLIC")}
          </Button>
          <Button onClick={props.onSetPrivate} loading={props.visibilityLoading}>
            {props.t("content_pages:BULK_SET_PRIVATE")}
          </Button>
          <Button onClick={props.onDuplicate} loading={props.duplicateLoading}>
            {props.t("content_pages:BULK_DUPLICATE")}
          </Button>
          <Button danger onClick={props.onDelete} loading={props.deleteLoading}>
            {props.t("content_pages:BULK_DELETE")}
          </Button>
        </div>
      </div>
    </div>
  );
}
