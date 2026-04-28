import * as React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";

import { ContentModelsRowActions } from "./content-models-row-actions";
import type { ContentModelsTableRow } from "../types";

type ContentModelEditScreenProps = {
  model: ContentModelsTableRow | null;
  canManageModels?: boolean;
  pending?: boolean;
  onDuplicate: (model: ContentModelsTableRow) => void;
  onDelete: (model: ContentModelsTableRow) => void;
  onClose: () => void;
};

export function ContentModelEditScreen(props: ContentModelEditScreenProps) {
  const { t } = useTranslation(["content", "common"]);
  const activeModel = props.model;

  const handleCopyId = React.useCallback(async () => {
    if (!activeModel) return;
    try {
      await copyToClipboard(activeModel.id);
      notifySuccessText(t("content:CONTENT_MODELS_ID_COPIED"));
    } catch {
      notifyErrorText(t("content:CONTENT_MODELS_ID_COPY_FAILED"));
    }
  }, [activeModel, t]);

  return (
    <ExpandableScreen
      expanded={Boolean(activeModel)}
      onExpandChange={(open) => {
        if (!open) props.onClose();
      }}
      layoutId="content-model-edit-screen"
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className="border border-border/80 bg-background shadow-2xl"
      >
        {activeModel ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-model-edit-screen-title"
            className="flex h-full min-h-0 flex-col"
          >
            <div className="flex items-center gap-4 border-b border-border/70 px-6 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <h2
                  id="content-model-edit-screen-title"
                  className="truncate text-callout font-semibold text-label-primary"
                >
                  {activeModel.name}
                </h2>
                <div className="shrink-0">
                  <ContentModelsRowActions
                    row={activeModel}
                    canManageModels={props.canManageModels}
                    pending={props.pending}
                    onCopyId={() => void handleCopyId()}
                    onDuplicate={props.onDuplicate}
                    onDelete={props.onDelete}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={t("common:CLOSE")}
                  onClick={props.onClose}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto" />
          </div>
        ) : null}
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
