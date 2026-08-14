import { useTranslation } from "react-i18next";

import type { KnowledgeGuidancePreviewOut, KnowledgeGuidanceRevisionOut } from "@arclayer/openapi";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { MarkdownPlatePreview } from "@/components/editor/markdown-plate-editor";

type PendingPreview =
  | Readonly<{
      kind: "restore";
      preview: KnowledgeGuidancePreviewOut;
      revision: KnowledgeGuidanceRevisionOut;
    }>
  | Readonly<{
      kind: "remove";
      preview: KnowledgeGuidancePreviewOut;
    }>;

export function WorkspaceGuidanceImpactDialog(props: {
  pendingPreview: PendingPreview | null;
  pending: boolean;
  error: unknown;
  scope: "workspace" | "project";
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const preview = props.pendingPreview?.preview;
  const isRemoval = props.pendingPreview?.kind === "remove";

  if (isRemoval) {
    return (
      <AlertDialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) props.onOpenChange(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                props.scope === "project" ? "PROJECT_REMOVE_PREVIEW_TITLE" : "REMOVE_PREVIEW_TITLE",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                props.scope === "project"
                  ? "PROJECT_REMOVE_PREVIEW_DESCRIPTION"
                  : "REMOVE_PREVIEW_DESCRIPTION",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <PreviewFeedback canApply={preview?.canApply === true} error={props.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.pending}>{t("REMOVE_CANCEL")}</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={props.pending}
              disabled={preview?.canApply !== true}
              onClick={props.onApply}
            >
              {t(props.scope === "project" ? "PROJECT_REMOVE_APPLY" : "REMOVE_APPLY")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) props.onOpenChange(false);
      }}
    >
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("RESTORE_PREVIEW_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              props.scope === "project"
                ? "PROJECT_RESTORE_PREVIEW_DESCRIPTION"
                : "RESTORE_PREVIEW_DESCRIPTION",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {props.pendingPreview?.kind === "restore" ? (
          <MarkdownPlatePreview
            ariaLabel={t("HISTORY_PREVIEW_CONTENT_LABEL")}
            value={props.pendingPreview.revision.content}
          />
        ) : null}
        <PreviewFeedback canApply={preview?.canApply === true} error={props.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>{t("REMOVE_CANCEL")}</AlertDialogCancel>
          <Button
            loading={props.pending}
            disabled={preview?.canApply !== true}
            onClick={props.onApply}
          >
            {t("RESTORE_APPLY")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PreviewFeedback(props: { canApply: boolean; error: unknown }) {
  const { t } = useTranslation("knowledge");
  return (
    <>
      {!props.canApply ? (
        <Alert variant="destructive">
          <AlertTitle>{t("PREVIEW_STALE_TITLE")}</AlertTitle>
          <AlertDescription>{t("PREVIEW_STALE_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
      {props.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("APPLY_FAILED_TITLE")}</AlertTitle>
          <AlertDescription>{t("APPLY_FAILED_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
