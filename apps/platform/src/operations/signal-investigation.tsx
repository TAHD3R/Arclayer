import { AlertTriangle, ExternalLink, History, Info, Wrench } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  OperationalSignalDetailOut,
  OperationalSignalTriageHistoryOut,
} from "@arclayer/platform-openapi";

import { getTrustedSupportingRouteDestination } from "@/capabilities/module-registry";
import { formatDateTime } from "@/operations/operations-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function DetailField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

type JobEvidence = Readonly<{
  attemptCount: number;
  errorCode?: string;
  jobType: string;
  statusKey?: string;
}>;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readJobEvidence(detail: OperationalSignalDetailOut): JobEvidence | null {
  if (detail.sourceDomain !== "jobs") return null;
  const summary = detail.evidence.summary;
  const jobType = optionalString(summary.jobType);
  const attemptCount = summary.attemptCount;
  if (!jobType || typeof attemptCount !== "number" || !Number.isInteger(attemptCount)) return null;
  return {
    attemptCount,
    errorCode: optionalString(summary.errorCode),
    jobType,
    statusKey: optionalString(summary.statusKey),
  };
}

function affectedScopeId(detail: OperationalSignalDetailOut, key: string): string | undefined {
  return optionalString(detail.affectedScope[key]);
}

function HistoryItem({ item }: Readonly<{ item: OperationalSignalTriageHistoryOut }>) {
  const { t } = useTranslation("inbox");
  return (
    <li className="relative grid gap-1 border-l pl-5 pb-5 last:pb-0">
      <span className="absolute top-1 -left-1.5 size-3 rounded-full border bg-card" />
      <p className="text-sm font-medium">{t(`HISTORY_${item.action.toUpperCase()}`)}</p>
      <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
      {item.reminderAt && (
        <p className="text-sm">
          {t("REMINDER_RETURNS", { date: formatDateTime(item.reminderAt) })}
        </p>
      )}
      {item.reminderReason && (
        <blockquote className="rounded-md border-l-2 bg-muted px-3 py-2 text-sm">
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
  const destination = getTrustedSupportingRouteDestination(detail.destination.routeTarget);
  const stateKey = `inbox:TRIAGE_${detail.triage.state.toUpperCase()}`;
  const severityKey = `inbox:SEVERITY_${detail.severity.toUpperCase()}`;
  const evidence = readJobEvidence(detail);
  const workspaceId = affectedScopeId(detail, "workspaceId");
  const projectId = affectedScopeId(detail, "projectId");
  const siteId = affectedScopeId(detail, "siteId");
  return (
    <div className="space-y-6">
      <section aria-labelledby="signal-impact-heading" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.severity === "critical" ? "destructive" : "outline"}>
            {t(severityKey)}
          </Badge>
          <Badge variant={detail.sourceLifecycle === "resolved" ? "secondary" : "outline"}>
            {detail.sourceLifecycle === "resolved" ? t("inbox:SOURCE_RESOLVED") : t(stateKey)}
          </Badge>
        </div>
        <h2 className="text-2xl font-semibold" id="signal-impact-heading">
          {t(detail.copy.titleKey)}
        </h2>
        <p className="text-base text-muted-foreground">{t(detail.copy.explanationKey)}</p>
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("inbox:IMPACT")}</p>
          <p className="mt-1 text-base">{t(detail.copy.impactKey)}</p>
        </div>
      </section>

      {detail.sourceLifecycle === "resolved" ? (
        <div className="flex gap-3 rounded-lg border bg-muted/50 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{t("inbox:RESOLVED_READ_ONLY_TITLE")}</p>
            <p className="text-sm text-muted-foreground">
              {t("inbox:RESOLVED_READ_ONLY_DESCRIPTION")}
            </p>
          </div>
        </div>
      ) : (
        actions
      )}

      <Separator />

      <section aria-labelledby="signal-evidence-heading" className="space-y-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold" id="signal-evidence-heading">
          <Wrench aria-hidden="true" className="size-5" />
          {t("inbox:EVIDENCE_TITLE")}
        </h2>
        {!evidence && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{t("inbox:EVIDENCE_CONTRACT_ERROR_TITLE")}</AlertTitle>
            <AlertDescription>{t("inbox:EVIDENCE_CONTRACT_ERROR_DESCRIPTION")}</AlertDescription>
          </Alert>
        )}
        <dl className="grid gap-4 sm:grid-cols-2">
          {evidence && <DetailField label={t("inbox:JOB_KIND")} value={evidence.jobType} />}
          {evidence && (
            <DetailField
              label={t("inbox:ATTEMPTS")}
              value={new Intl.NumberFormat().format(evidence.attemptCount)}
            />
          )}
          <DetailField label={t("inbox:DETECTED_AT")} value={formatDateTime(detail.detectedAt)} />
          <DetailField
            label={t("inbox:SOURCE_UPDATED_AT")}
            value={formatDateTime(detail.freshness.sourceUpdatedAt)}
          />
          {evidence?.errorCode && (
            <DetailField label={t("inbox:ERROR_CODE")} value={evidence.errorCode} />
          )}
        </dl>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("inbox:RESOLUTION_CONFIRMED_WHEN")}
          </p>
          <p className="mt-1 text-sm">{t(detail.resolutionConditionKey)}</p>
        </div>
        {showDestination && destination && detail.destination.authorized && (
          <Button asChild variant="outline">
            <Link params={{ signalId: detail.id }} to={destination.path}>
              {t(destination.labelKey)}
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        )}
        {showDestination && !destination && (
          <p className="text-sm text-destructive">{t("REMEDIATION_ROUTE_UNAVAILABLE")}</p>
        )}
        {showDestination && destination && !detail.destination.authorized && (
          <p className="text-sm text-muted-foreground">{t("REMEDIATION_PERMISSION_REQUIRED")}</p>
        )}
      </section>

      <Separator />

      <section aria-labelledby="signal-history-heading" className="space-y-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold" id="signal-history-heading">
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
          <p className="text-sm text-muted-foreground">{t("inbox:HISTORY_EMPTY")}</p>
        )}
      </section>

      <section aria-labelledby="signal-notes-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="signal-notes-heading">
          {t("NOTES_TITLE")}
        </h2>
        {detail.notes.length ? (
          <ol className="space-y-3">
            {detail.notes.map((note) => (
              <li className="rounded-lg border p-3" key={note.revision}>
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("NOTE_RECORDED", {
                    date: formatDateTime(note.createdAt),
                    revision: note.revision,
                  })}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("NOTES_EMPTY")}</p>
        )}
      </section>

      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">{t("inbox:DIAGNOSTICS_TITLE")}</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailField label={t("inbox:SIGNAL_ID")} value={detail.id} />
          <DetailField label={t("inbox:SOURCE_REFERENCE")} value={detail.sourceReference.id} />
          {workspaceId && <DetailField label={t("inbox:WORKSPACE_ID")} value={workspaceId} />}
          {projectId && <DetailField label={t("inbox:PROJECT_ID")} value={projectId} />}
          {siteId && <DetailField label={t("inbox:SITE_ID")} value={siteId} />}
          {evidence?.statusKey && (
            <DetailField label={t("inbox:SOURCE_STATUS")} value={evidence.statusKey} />
          )}
        </dl>
      </details>
    </div>
  );
}
