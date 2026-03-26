import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

export function ContentLibraryPreviewPanel(props: { onClose: () => void; className?: string }) {
  const { t } = useTranslation(["content", "common"]);

  return (
    <aside
      data-slot="content-library-preview-panel"
      className={props.className}
      aria-label={t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-4">
          <div className="min-w-0 space-y-1.5">
            <div className="text-title3 text-label-primary">
              {t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
            </div>
            <div className="text-callout text-label-secondary">
              {t("CONTENT_LIBRARY_PREVIEW_PANEL_DESC")}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={props.onClose}
            aria-label={t("common:CLOSE")}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 bg-background" />
      </div>
    </aside>
  );
}
