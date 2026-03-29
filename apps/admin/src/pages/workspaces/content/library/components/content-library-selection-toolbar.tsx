import { Archive, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { SelectedCountTag } from "@/components/ui/tags";
import { Button } from "@arclayer/ui/button";

type ContentLibrarySelectionToolbarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedCount: number;
  archivePending?: boolean;
  deletePending?: boolean;
  onClearSelection: () => void;
  onOpenArchive: () => void;
  onOpenDelete: () => void;
};

export function ContentLibrarySelectionToolbar(props: ContentLibrarySelectionToolbarProps) {
  return (
    <AnimatePresence>
      {props.selectedCount > 0 ? (
        <motion.div
          key="content-library-selection-toolbar"
          className="pointer-events-none sticky bottom-0 z-30 mt-auto w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div className="pointer-events-auto w-full border-t border-border bg-card ">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-5 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <SelectedCountTag
                  label={props.t("content:CONTENT_LIBRARY_SELECTED_COUNT", {
                    count: props.selectedCount,
                  })}
                />
                <Button variant="ghost" size="sm" onClick={props.onClearSelection}>
                  {props.t("common:DATA_TABLE_CLEAR_SELECTION")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={props.onOpenArchive}
                  disabled={props.archivePending}
                >
                  <Archive className="size-4" />
                  {props.t("content:CONTENT_LIBRARY_ACTION_ARCHIVE")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={props.onOpenDelete}
                  disabled={props.deletePending}
                >
                  <Trash2 className="size-4" />
                  {props.t("content:CONTENT_LIBRARY_ACTION_DELETE")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
