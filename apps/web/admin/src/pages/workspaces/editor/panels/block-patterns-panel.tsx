import { useTranslation } from "react-i18next";

import {
  CORE_BLOCK_PATTERNS,
  resolveLocalizedValue,
  type ViewerContext,
} from "@celestial/site-block-protocol";

const VIEWER_CTX: ViewerContext = { locale: "zh-CN", fallbackLocale: "en-US" };

export function BlockPatternsPanel() {
  const { t } = useTranslation(["content_pages"]);

  if (CORE_BLOCK_PATTERNS.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-xs text-muted-foreground">
          {t("content_pages:EDITOR_V2_PATTERNS_EMPTY", {
            defaultValue: "No patterns available",
          })}
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
          className="rounded-md border p-2 text-left text-xs hover:bg-muted"
        >
          {resolveLocalizedValue(p.label, VIEWER_CTX) ?? p.code}
        </button>
      ))}
    </div>
  );
}
