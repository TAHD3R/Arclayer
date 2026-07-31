import { ExternalLink, History, Info, Wrench } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  OperationalSignalDetailOut,
  OperationalSignalTriageHistoryOut,
} from "@arclayer/platform-openapi";

import { jobIdFromDestination } from "@/operations/operations-routing";
import { formatDateTime } from "@/operations/operations-ui";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";

function DetailField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="space-y-1">
      <dt className="text-caption font-medium text-label-secondary">{label}</dt>
      <dd className="break-words text-footnote text-label-primary">{value}</dd>
    </div>
  );
}

function HistoryItem({ item }: Readonly<{ item: OperationalSignalTriageHistoryOut }>) {
  const { t } = useTranslation("inbox");
  return (
    <li className="relative grid gap-1 border-l pl-5 pb-5 last:pb-0">
      <span className="absolute top-1 -left-1.5 size-3 rounded-full border bg-card" />
      <p className="text-footnote font-medium">{t(`HISTORY_${item.action.toUpperCase()}`)}</p>
      <p className="text-caption text-label-secondary">{formatDateTime(item.createdAt)}</p>
      {item.reminderAt && (
        <p className="text-footnote">
          {t("REMINDER_RETURNS", { date: formatDateTime(item.reminderAt) })}
        </p>
      )}
      {item.reminderReason && (
        <blockquote className="rounded-md border-l-2 bg-muted px-3 py-2 text-footnote">
          {item.reminderReason}
        </blockquote>
      )}
    </li>
  );
}

export function SignalInvestigation({
  detail,
  actions,
  showDestination = true,
}: Readonly<{
  detail: OperationalSignalDetailOut;
  actions?: React.ReactNode;
  showDestination?: boolean;
}>) {
  const { t } = useTranslation(["inbox"]);
  const destinationJobId = jobIdFromDestination(detail.destination.path);
  const stateKey = `inbox:TRIAGE_${detail.triage.state.toUpperCase()}`;
  return (
    <div className="space-y-6">
      <section aria-labelledby="signal-impact-heading" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">{t("inbox:SEVERITY_HIGH")}</Badge>
          <Badge variant={detail.sourceLifecycle === "resolved" ? "secondary" : "outline"}>
            {detail.sourceLifecycle === "resolved" ? t("inbox:SOURCE_RESOLVED") : t(stateKey)}
          </Badge>
        </div>
        <h2 className="text-title3 font-semibold" id="signal-impact-heading">
          {t(detail.copy.titleKey)}
        </h2>
        <p className="text-body text-label-secondary">{t(detail.copy.explanationKey)}</p>
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-caption font-semibold text-label-secondary">{t("inbox:IMPACT")}</p>
          <p className="mt-1 text-body">{t(detail.copy.impactKey)}</p>
        </div>
      </section>

      {detail.sourceLifecycle === "resolved" ? (
        <div className="flex gap-3 rounded-lg border bg-muted/50 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-label-secondary" />
          <div>
            <p className="font-medium">{t("inbox:RESOLVED_READ_ONLY_TITLE")}</p>
            <p className="text-footnote text-label-secondary">
              {t("inbox:RESOLVED_READ_ONLY_DESCRIPTION")}
            </p>
          </div>
        </div>
      ) : (
        actions
      )}

      <Separator />

      <section aria-labelledby="signal-evidence-heading" className="space-y-4">
        <h2
          className="flex items-center gap-2 text-title3 font-semibold"
          id="signal-evidence-heading"
        >
          <Wrench aria-hidden="true" className="size-5" />
          {t("inbox:EVIDENCE_TITLE")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label={t("inbox:JOB_KIND")} value={detail.evidence.jobType} />
          <DetailField
            label={t("inbox:ATTEMPTS")}
            value={new Intl.NumberFormat().format(detail.evidence.attemptCount)}
          />
          <DetailField label={t("inbox:DETECTED_AT")} value={formatDateTime(detail.detectedAt)} />
          <DetailField
            label={t("inbox:SOURCE_UPDATED_AT")}
            value={formatDateTime(detail.freshness.sourceUpdatedAt)}
          />
          {detail.evidence.errorCode && (
            <DetailField label={t("inbox:ERROR_CODE")} value={detail.evidence.errorCode} />
          )}
        </dl>
        <div className="rounded-lg border p-4">
          <p className="text-caption font-semibold text-label-secondary">
            {t("inbox:RESOLUTION_CONFIRMED_WHEN")}
          </p>
          <p className="mt-1 text-footnote">{t(detail.resolutionConditionKey)}</p>
        </div>
        {showDestination && destinationJobId && (
          <Button asChild variant="outline">
            <Link search={{ jobId: destinationJobId }} to="/operations/jobs">
              {t(detail.destination.labelKey)}
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        )}
      </section>

      <Separator />

      <section aria-labelledby="signal-history-heading" className="space-y-4">
        <h2
          className="flex items-center gap-2 text-title3 font-semibold"
          id="signal-history-heading"
        >
          <History aria-hidden="true" className="size-5" />
          {t("inbox:HISTORY_TITLE")}
        </h2>
        {detail.triageHistory.length ? (
          <ol>
            {detail.triageHistory.map((item) => (
              <HistoryItem item={item} key={item.revision} />
            ))}
          </ol>
        ) : (
          <p className="text-footnote text-label-secondary">{t("inbox:HISTORY_EMPTY")}</p>
        )}
      </section>

      <details className="rounded-lg border p-4 text-footnote">
        <summary className="cursor-pointer font-medium">{t("inbox:DIAGNOSTICS_TITLE")}</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailField label={t("inbox:SIGNAL_ID")} value={detail.id} />
          <DetailField label={t("inbox:SOURCE_REFERENCE")} value={detail.sourceReference.id} />
          {detail.evidence.workspaceId && (
            <DetailField label={t("inbox:WORKSPACE_ID")} value={detail.evidence.workspaceId} />
          )}
          {detail.evidence.projectId && (
            <DetailField label={t("inbox:PROJECT_ID")} value={detail.evidence.projectId} />
          )}
          {detail.evidence.siteId && (
            <DetailField label={t("inbox:SITE_ID")} value={detail.evidence.siteId} />
          )}
          {detail.evidence.statusKey && (
            <DetailField label={t("inbox:SOURCE_STATUS")} value={detail.evidence.statusKey} />
          )}
        </dl>
      </details>
    </div>
  );
}
