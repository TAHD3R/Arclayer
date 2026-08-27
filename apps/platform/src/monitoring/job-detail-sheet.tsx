import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformJobAttemptOut } from "@arclayer/platform-openapi";

import { formatDateTime, formatDuration } from "@/monitoring/format";
import { getJobDetail } from "@/monitoring/monitoring-api";
import { MonitoringQueryState, useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ATTEMPT_STATUS_LABEL_KEYS: Record<PlatformJobAttemptOut["status"], string> = {
  claimed: "JOB_ATTEMPT_STATUS_CLAIMED",
  running: "JOB_ATTEMPT_STATUS_RUNNING",
  interrupted: "JOB_ATTEMPT_STATUS_INTERRUPTED",
  succeeded: "JOB_ATTEMPT_STATUS_SUCCEEDED",
  failed: "JOB_ATTEMPT_STATUS_FAILED",
  cancelled: "JOB_ATTEMPT_STATUS_CANCELLED",
  lease_expired: "JOB_ATTEMPT_STATUS_LEASE_EXPIRED",
};

const FAILURE_CLASSIFICATION_LABEL_KEYS: Record<
  NonNullable<PlatformJobAttemptOut["failureClassification"]>,
  string
> = {
  transient: "JOB_FAILURE_CLASS_TRANSIENT",
  permanent: "JOB_FAILURE_CLASS_PERMANENT",
  unexpected: "JOB_FAILURE_CLASS_UNEXPECTED",
  worker_lost: "JOB_FAILURE_CLASS_WORKER_LOST",
};

const RETRY_DECISION_LABEL_KEYS: Record<
  NonNullable<PlatformJobAttemptOut["retryDecision"]>,
  string
> = {
  scheduled: "JOB_RETRY_DECISION_SCHEDULED",
  exhausted: "JOB_RETRY_DECISION_EXHAUSTED",
  code_not_allowed: "JOB_RETRY_DECISION_CODE_NOT_ALLOWED",
  not_retryable: "JOB_RETRY_DECISION_NOT_RETRYABLE",
};

function attemptBadgeVariant(status: PlatformJobAttemptOut["status"]) {
  return status === "failed" || status === "interrupted" || status === "lease_expired"
    ? "destructive"
    : status === "succeeded"
      ? "outline"
      : "secondary";
}

export function JobDetailSheet({
  jobId,
  jobType,
  onClose,
}: Readonly<{ jobId: string; jobType: string; onClose: () => void }>) {
  const { t } = useTranslation("monitoring");
  const load = useCallback(() => getJobDetail({ job_id: jobId }), [jobId]);
  const { state, retry } = useMonitoringQuery(load, [jobId]);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t("JOB_DETAIL_TITLE")}</SheetTitle>
          <SheetDescription className="break-all font-mono text-xs">{jobType}</SheetDescription>
        </SheetHeader>
        <div className="px-6">
          <MonitoringQueryState isEmpty={() => false} retry={retry} state={state}>
            {(detail) => (
              <div className="space-y-6">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{t("CORRELATION")}</dt>
                    <dd className="break-all font-mono text-xs">{detail.correlationId}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("JOB_RETRY_AT")}</dt>
                    <dd>
                      {detail.nextAttemptAt
                        ? formatDateTime(detail.nextAttemptAt)
                        : t("UNAVAILABLE")}
                    </dd>
                  </div>
                  {detail.errorMessage ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{t("TECHNICAL_DETAILS")}</dt>
                      <dd className="mt-1 break-all rounded border bg-muted/50 p-2 font-mono text-xs">
                        {detail.errorCode ? `${detail.errorCode}: ` : ""}
                        {detail.errorMessage}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("JOB_ATTEMPTS")}</TableHead>
                      <TableHead>{t("STATUS")}</TableHead>
                      <TableHead>{t("JOB_WORKER")}</TableHead>
                      <TableHead>{t("TIME")}</TableHead>
                      <TableHead>{t("JOB_FAILURE_CLASSIFICATION")}</TableHead>
                      <TableHead>{t("JOB_RETRY_DECISION")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.attempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          {t("JOB_ATTEMPT_NUMBER", { number: attempt.attemptNumber })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={attemptBadgeVariant(attempt.status)}>
                            {t(ATTEMPT_STATUS_LABEL_KEYS[attempt.status])}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="break-all font-mono text-xs">{attempt.workerId}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block">{formatDateTime(attempt.startedAt)}</span>
                          {attempt.completedAt ? (
                            <span className="text-xs text-muted-foreground">
                              → {formatDateTime(attempt.completedAt)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {attempt.failureClassification
                            ? t(FAILURE_CLASSIFICATION_LABEL_KEYS[attempt.failureClassification])
                            : t("UNAVAILABLE")}
                        </TableCell>
                        <TableCell>
                          {attempt.retryDecision ? (
                            <span className="block">
                              {t(RETRY_DECISION_LABEL_KEYS[attempt.retryDecision])}
                            </span>
                          ) : null}
                          {attempt.retryAt ? (
                            <span className="block text-xs text-muted-foreground">
                              {t("JOB_RETRY_AT")}: {formatDateTime(attempt.retryAt)}
                            </span>
                          ) : null}
                          {typeof attempt.retryDelaySeconds === "number" ? (
                            <span className="block text-xs text-muted-foreground">
                              {t("JOB_RETRY_DELAY")}:{" "}
                              {formatDuration(attempt.retryDelaySeconds * 1_000)}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </MonitoringQueryState>
        </div>
      </SheetContent>
    </Sheet>
  );
}
