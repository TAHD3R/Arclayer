import { Button } from "antd";
import { AnimatePresence, motion } from "motion/react";

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
  return (
    <AnimatePresence>
      {props.selectedCount > 0 ? (
        <motion.div
          key="content-pages-selection-toolbar"
          className="fixed bottom-0 right-0 left-[240px] z-30 pointer-events-none"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div className="pointer-events-auto w-full border-t border-border bg-card shadow-[0_-16px_30px_-24px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-footnote font-semibold">
                  {props.t("content_pages:BULK_SELECTED_COUNT", { count: props.selectedCount })}
                </span>
                <Button type="text" onClick={props.onClearSelection}>
                  {props.t("content_pages:BULK_CLEAR_SELECTION")}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button type="text" onClick={props.onSetPublic} loading={props.visibilityLoading}>
                  {props.t("content_pages:BULK_SET_PUBLIC")}
                </Button>
                <Button type="text" onClick={props.onSetPrivate} loading={props.visibilityLoading}>
                  {props.t("content_pages:BULK_SET_PRIVATE")}
                </Button>
                <Button type="text" onClick={props.onDuplicate} loading={props.duplicateLoading}>
                  {props.t("content_pages:BULK_DUPLICATE")}
                </Button>
                <Button
                  type="primary"
                  danger
                  onClick={props.onDelete}
                  loading={props.deleteLoading}
                >
                  {props.t("content_pages:BULK_DELETE")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
