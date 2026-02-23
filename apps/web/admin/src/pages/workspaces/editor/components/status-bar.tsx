import { useTranslation } from "react-i18next";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

export function StatusBar() {
  const { t } = useTranslation(["content_pages"]);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t bg-card px-3 text-xs text-muted-foreground">
      <span>
        {selectedBlockId
          ? t("content_pages:EDITOR_V2_STATUS_BLOCK", {
              defaultValue: "Block: {{id}}",
              id: selectedBlockId,
            })
          : "/"}
      </span>
      <span>{zoomPercent}%</span>
    </div>
  );
}
