import { useTranslation } from "react-i18next";

import { CORE_BLOCK_PATTERNS, resolveLocalizedValue } from "@celestial/site-block-protocol";

import { useViewerContext } from "@/pages/workspaces/editor/hooks/use-viewer-context";

export function BlockPatternsPanel() {
  const { t } = useTranslation(["content_pages"]);
  const viewerCtx = useViewerContext();

  if (CORE_BLOCK_PATTERNS.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_EMPTY_BLOCK_PATTERNS")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {CORE_BLOCK_PATTERNS.map((p) => (
        <button
          key={p.code}
          type="button"
          className="rounded-md border p-2 text-left text-caption hover:bg-muted"
        >
          {resolveLocalizedValue(p.label, viewerCtx) ?? p.code}
        </button>
      ))}
    </div>
  );
}
