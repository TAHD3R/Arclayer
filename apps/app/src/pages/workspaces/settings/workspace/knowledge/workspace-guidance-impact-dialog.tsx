import { useTranslation } from "react-i18next";
import { Check, CircleArrowRight, ShieldAlert } from "lucide-react";

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

const RETAINED_ITEM_KEYS = [
  "REMOVE_RETAINED_HISTORY",
  "REMOVE_RETAINED_SOURCES",
  "REMOVE_RETAINED_RECOVERY",
] as const;

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
      <AlertDialogContent className="flex max-h-[min(720px,calc(100vh-2rem))] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <AlertDialogHeader className="border-b px-6 py-5">
          <p className="text-caption font-semibold text-label-secondary">
            {t(isRemoval ? "REMOVE_PREVIEW_EYEBROW" : "RESTORE_PREVIEW_EYEBROW")}
          </p>
          <AlertDialogTitle className="mt-1 text-title2">
            {isRemoval
              ? t(
                  props.scope === "project"
                    ? "PROJECT_REMOVE_PREVIEW_TITLE"
                    : "REMOVE_PREVIEW_TITLE",
                )
              : t("RESTORE_PREVIEW_TITLE")}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2">
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

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {preview && isRemoval ? (
            <RemovalImpactSummary preview={preview} scope={props.scope} />
          ) : null}
          {preview && !isRemoval ? <RestoreImpactSummary preview={preview} /> : null}
          {preview?.canApply !== true ? (
            <Alert className="mt-5" variant="destructive">
              <AlertTitle>{t("PREVIEW_STALE_TITLE")}</AlertTitle>
              <AlertDescription>{t("PREVIEW_STALE_DESCRIPTION")}</AlertDescription>
            </Alert>
          ) : null}
          {props.error ? (
            <Alert className="mt-5" variant="destructive">
              <AlertTitle>{t("APPLY_FAILED_TITLE")}</AlertTitle>
              <AlertDescription>{t("APPLY_FAILED_DESCRIPTION")}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <AlertDialogFooter className="border-t px-6 py-4">
          <AlertDialogCancel disabled={props.pending}>{t("REMOVE_CANCEL")}</AlertDialogCancel>
          <Button
            variant={isRemoval ? "destructive" : "default"}
            loading={props.pending}
            disabled={preview?.canApply !== true}
            onClick={props.onApply}
          >
            {isRemoval
              ? t(props.scope === "project" ? "PROJECT_REMOVE_APPLY" : "REMOVE_APPLY")
              : t("RESTORE_APPLY")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemovalImpactSummary(props: {
  preview: KnowledgeGuidancePreviewOut;
  scope: "workspace" | "project";
}) {
  const { t } = useTranslation("knowledge");
  const impact = props.preview.impact;
  const projectCount = impact.projectGuidanceCount;
  const metrics = [
    { label: t("IMPACT_REFERENCES"), value: impact.referenceCount },
    { label: t("IMPACT_SOURCES"), value: impact.sourceCount },
    { label: t("IMPACT_READY_SOURCES"), value: impact.readySourceCount },
    ...(props.scope === "workspace"
      ? [{ label: t("IMPACT_PROJECT_GUIDANCE"), value: projectCount }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>{t("REMOVE_SCOPE_CHANGE_TITLE")}</AlertTitle>
        <AlertDescription>
          {t(
            props.scope === "workspace"
              ? "REMOVE_SCOPE_CHANGE_WORKSPACE"
              : "REMOVE_SCOPE_CHANGE_PROJECT",
          )}
        </AlertDescription>
      </Alert>

      <section className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <CircleArrowRight
            className="mt-0.5 size-4 shrink-0 text-label-secondary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-headline font-semibold text-label-primary">
              {t("REMOVE_CONNECTED_CONTEXT_TITLE")}
            </h3>
            <p className="mt-1 text-footnote leading-6 text-label-secondary">
              {t("REMOVE_CONNECTED_CONTEXT_DESCRIPTION", {
                references: impact.referenceCount,
                sources: impact.sourceCount,
                ready: impact.readySourceCount,
              })}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-caption text-label-secondary">{metric.label}</dt>
              <dd className="mt-1 text-title3 font-semibold tabular-nums text-label-primary">
                {metric.value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-border pt-4">
        <h3 className="text-headline font-semibold text-label-primary">
          {t("REMOVE_RETAINED_TITLE")}
        </h3>
        <ul className="mt-3 space-y-2 text-footnote leading-6 text-label-secondary">
          {RETAINED_ITEM_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>

      {props.scope === "workspace" && projectCount > 0 ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-caption leading-5 text-label-secondary">
          {t("REMOVE_PROJECT_GUIDANCE_NOTE", { count: projectCount })}
        </p>
      ) : null}
    </div>
  );
}

function RestoreImpactSummary({ preview }: { preview: KnowledgeGuidancePreviewOut }) {
  const { t } = useTranslation("knowledge");
  return (
    <section className="rounded-lg border bg-muted/20 p-4" aria-labelledby="guidance-impact-title">
      <h3 id="guidance-impact-title" className="text-headline font-semibold text-label-primary">
        {t("IMPACT_SECTION_TITLE")}
      </h3>
      <p className="mt-1 text-footnote leading-6 text-label-secondary">
        {t("RESTORE_IMPACT_SECTION_DESCRIPTION")}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ImpactItem label={t("IMPACT_REFERENCES")} value={preview.impact.referenceCount} />
        <ImpactItem label={t("IMPACT_SOURCES")} value={preview.impact.sourceCount} />
        <ImpactItem label={t("IMPACT_READY_SOURCES")} value={preview.impact.readySourceCount} />
      </dl>
    </section>
  );
}

function ImpactItem(props: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
      <dt className="text-caption text-label-secondary">{props.label}</dt>
      <dd className="mt-1 text-title3 font-semibold tabular-nums text-label-primary">
        {props.value.toLocaleString()}
      </dd>
    </div>
  );
}
