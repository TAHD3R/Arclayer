import { AlertCircle, Cloud, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/lib/notifications";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Spinner } from "@arclayer/ui/spinner";

type SaveIndicatorState = "hidden" | "saving" | "saved" | "error";

export function ContentLibraryArticleEditorSaveIndicator(props: {
  state: SaveIndicatorState;
  isPublishing?: boolean;
  error?: unknown;
}) {
  const { t } = useTranslation("content");

  if (props.isPublishing) {
    return (
      <div className="inline-flex items-center gap-2 text-callout text-label-secondary">
        <Spinner className="size-4" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_PUBLISHING")}</span>
      </div>
    );
  }

  if (props.state === "hidden") return null;

  if (props.state === "saving") {
    return (
      <div className="inline-flex items-center gap-2 text-callout text-label-secondary">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_SAVING")}</span>
      </div>
    );
  }

  if (props.state === "saved") {
    return (
      <div className="inline-flex items-center gap-2 text-callout text-label-secondary">
        <Cloud className="size-4" />
        <span>{t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_SAVED")}</span>
      </div>
    );
  }

  const errorText = props.error
    ? getErrorMessage(props.error)
    : t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_ERROR");

  const content = (
    <div className="inline-flex items-center gap-2 text-callout text-destructive">
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
