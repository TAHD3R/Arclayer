import { useTranslation } from "react-i18next";

import type { PendingGuidanceRemoval } from "./use-workspace-guidance-controller";
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

export function WorkspaceGuidanceImpactDialog(props: {
  pendingRemoval: PendingGuidanceRemoval | null;
  pending: boolean;
  error: unknown;
  scope: "workspace" | "project";
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const preview = props.pendingRemoval?.preview;

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
            {t(props.scope === "project" ? "PROJECT_REMOVE_PREVIEW_TITLE" : "REMOVE_PREVIEW_TITLE")}
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
