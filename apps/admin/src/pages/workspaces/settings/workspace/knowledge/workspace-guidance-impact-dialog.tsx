import { useTranslation } from "react-i18next";

import type { KnowledgeGuidancePreviewOut } from "@arclayer/openapi";
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

type PendingPreview = Readonly<{
  kind: "restore" | "remove";
  preview: KnowledgeGuidancePreviewOut;
}>;

function impactValue(value: number | undefined, unavailable: string): string {
  return typeof value === "number" ? String(value) : unavailable;
}

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
            {isRemoval ? t("REMOVE_PREVIEW_TITLE") : t("RESTORE_PREVIEW_TITLE")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isRemoval
              ? t(
                  props.scope === "project"
                    ? "PROJECT_REMOVE_PREVIEW_DESCRIPTION"
                    : "REMOVE_PREVIEW_DESCRIPTION",
                )
              : t(
                  props.scope === "project"
                    ? "PROJECT_RESTORE_PREVIEW_DESCRIPTION"
                    : "RESTORE_PREVIEW_DESCRIPTION",
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview ? (
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-footnote">
            <ImpactItem
              label={t("IMPACT_REFERENCES")}
              value={impactValue(preview.impact?.referenceCount, t("IMPACT_UNAVAILABLE"))}
            />
            <ImpactItem
              label={t("IMPACT_SOURCES")}
              value={impactValue(preview.impact?.sourceCount, t("IMPACT_UNAVAILABLE"))}
            />
            <ImpactItem
              label={t("IMPACT_READY_SOURCES")}
              value={impactValue(preview.impact?.readySourceCount, t("IMPACT_UNAVAILABLE"))}
            />
            <ImpactItem
              label={t("IMPACT_PROJECT_GUIDANCE")}
              value={impactValue(preview.impact?.projectGuidanceCount, t("IMPACT_UNAVAILABLE"))}
            />
          </dl>
        ) : null}

        {preview?.canApply !== true ? (
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

        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>{t("CANCEL")}</AlertDialogCancel>
          <Button
            variant={isRemoval ? "destructive" : "default"}
            loading={props.pending}
            disabled={preview?.canApply !== true}
            onClick={props.onApply}
          >
            {isRemoval ? t("REMOVE_APPLY") : t("RESTORE_APPLY")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ImpactItem(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-label-secondary">{props.label}</dt>
      <dd className="mt-1 text-title3 font-semibold tabular-nums text-label-primary">
        {props.value}
      </dd>
    </div>
  );
}
