import { AlertCircle, Cloud, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/lib/notifications";
import type { ContentLibraryArticleEditorRuntimeState } from "@/pages/workspaces/content/library/runtime";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Spinner } from "@arclayer/ui/spinner";

export function ContentLibraryArticleEditorSaveIndicator(props: {
  runtime: Pick<
    ContentLibraryArticleEditorRuntimeState,
    "isPublishing" | "saveError" | "saveState"
  >;
}) {
  const { t } = useTranslation("content");

  if (props.runtime.isPublishing) {
    return (
      <div className="inline-flex items-center gap-2 text-footnote text-label-secondary">
        <Spinner className="size-4" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_PUBLISHING")}</span>
      </div>
    );
  }

  if (props.runtime.saveState === "hidden") return null;

  if (props.runtime.saveState === "saving") {
    return (
      <div className="inline-flex items-center gap-2 text-footnote text-label-secondary">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_SAVING")}</span>
      </div>
    );
  }

  if (props.runtime.saveState === "saved") {
    return (
      <div className="inline-flex items-center gap-2 text-footnote text-label-secondary">
        <Cloud className="size-4" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_SAVED")}</span>
      </div>
    );
  }

  const errorText = props.runtime.saveError
    ? getErrorMessage(props.runtime.saveError)
    : t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_ERROR");

  const content = (
    <div className="inline-flex items-center gap-2 text-footnote text-destructive">
      <AlertCircle className="size-4" />
      <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_ERROR")}</span>
    </div>
  );

  return (
    <Tooltip side="bottom" align="end">
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-[28rem]">{errorText}</TooltipContent>
    </Tooltip>
  );
}
