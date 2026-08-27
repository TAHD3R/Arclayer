import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  JobInternalStatus,
  JobWorkloadClass,
  PlatformJobQueueOut,
} from "@arclayer/platform-openapi";

import { formatDateTime } from "@/monitoring/format";
import { JobDetailSheet } from "@/monitoring/job-detail-sheet";
import { getJobQueues, listJobs } from "@/monitoring/monitoring-api";
import type { MonitoringJobsSearch } from "@/routes/_authenticated/monitoring/jobs";
import {
  MonitoringPage,
  MonitoringQueryState,
  MonitoringToolbar,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 20;
const FAILURE_WINDOW_HOURS = 24;

const JOB_STATUS_VALUES = [
  "pending_dispatch",
  "queued",
  "running",
  "retry_scheduled",
  "waiting_for_user",
  "succeeded",
  "failed",
  "dead_lettered",
  "cancelled",
] as const satisfies readonly JobInternalStatus[];

const JOB_WORKLOAD_VALUES = [
  "agent-io",
  "render-browser",
  "asset-cpu",
  "publish",
  "connector",
  "maintenance",
] as const satisfies readonly JobWorkloadClass[];

const JOB_STATUS_LABEL_KEYS: Record<JobInternalStatus, string> = {
  pending_dispatch: "JOB_STATUS_PENDING_DISPATCH",
  queued: "JOB_STATUS_QUEUED",
  running: "JOB_STATUS_RUNNING",
  retry_scheduled: "JOB_STATUS_RETRY_SCHEDULED",
  waiting_for_user: "JOB_STATUS_WAITING_FOR_USER",
  succeeded: "JOB_STATUS_SUCCEEDED",
  failed: "JOB_STATUS_FAILED",
  dead_lettered: "JOB_STATUS_DEAD_LETTERED",
  cancelled: "JOB_STATUS_CANCELLED",
};

const JOB_WORKLOAD_LABEL_KEYS: Record<JobWorkloadClass, string> = {
  "agent-io": "JOB_WORKLOAD_AGENT_IO",
  "render-browser": "JOB_WORKLOAD_RENDER_BROWSER",
  "asset-cpu": "JOB_WORKLOAD_ASSET_CPU",
  publish: "JOB_WORKLOAD_PUBLISH",
  connector: "JOB_WORKLOAD_CONNECTOR",
  maintenance: "JOB_WORKLOAD_MAINTENANCE",
};

function statusBadgeVariant(status: JobInternalStatus) {
  if (status === "failed" || status === "dead_lettered") return "destructive";
  if (status === "running") return "default";
  return "outline";
}

function queueBacklog(queue: PlatformJobQueueOut): number {
  return queue.pendingDispatchJobs + queue.queuedJobs + queue.retryScheduledJobs;
}

function QueueCard({ queue, backlog }: Readonly<{ queue: PlatformJobQueueOut; backlog: number }>) {
  const { t } = useTranslation("monitoring");
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{t(JOB_WORKLOAD_LABEL_KEYS[queue.workload])}</span>
        <Badge variant={backlog > 0 ? "secondary" : "outline"}>
          {t("JOBS_BACKLOG")} {backlog}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("JOBS_RUNNING")}</dt>
          <dd>{queue.runningJobs}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("JOBS_RETRY_WAITING")}</dt>
          <dd>{queue.retryScheduledJobs}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("JOBS_WAITING_FOR_USER")}</dt>
          <dd>{queue.waitingForUserJobs}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("JOBS_OUTBOX_IN_FLIGHT")}</dt>
          <dd>{queue.outboxInFlightDispatches}</dd>
        </div>
      </dl>
      <p className="text-sm">
        {t("JOBS_FAILED_IN_WINDOW")}: {queue.failedJobsInWindow} · {t("JOBS_DEAD_LETTERED")}:{" "}
        {queue.deadLetteredJobsInWindow}
        {queue.outboxDeadLetteredDispatches > 0
          ? ` · ${t("JOBS_OUTBOX_IN_FLIGHT")}: ${queue.outboxDeadLetteredDispatches}`
          : ""}
      </p>
      {queue.oldestBacklogCreatedAt ? (
        <p className="text-xs text-muted-foreground">
          {t("JOBS_OLDEST_BACKLOG")} {formatDateTime(queue.oldestBacklogCreatedAt)}
        </p>
      ) : null}
      <p className="break-all font-mono text-xs text-muted-foreground">
        {t("JOB_STREAM")}: {queue.streamName}
      </p>
    </div>
  );
}

export function MonitoringJobsPage(props: {
  search: MonitoringJobsSearch;
  onSearchChange: (search: MonitoringJobsSearch) => void;
}) {
  const { t } = useTranslation("monitoring");
  const status = JOB_STATUS_VALUES.includes(props.search.status as JobInternalStatus)
    ? (props.search.status as JobInternalStatus)
    : undefined;
  const workload = JOB_WORKLOAD_VALUES.includes(props.search.workload as JobWorkloadClass)
    ? (props.search.workload as JobWorkloadClass)
    : undefined;
  const page = props.search.page ?? 1;
  const update = (next: Partial<MonitoringJobsSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);

  const queuesLoad = useCallback(() => getJobQueues({ hours: FAILURE_WINDOW_HOURS }), []);
  const queuesQuery = useMonitoringQuery(queuesLoad, []);
  const jobsLoad = useCallback(
    () =>
      listJobs({
        page,
        size: PAGE_SIZE,
        status: status ?? null,
        workload: workload ?? null,
      }),
    [page, status, workload],
  );
  const jobsQuery = useMonitoringQuery(jobsLoad, [page, status, workload]);
  const filtered = Boolean(status || workload);

  return (
    <MonitoringPage description={t("JOBS_DESCRIPTION")} title={t("JOBS_TITLE")}>
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-medium">{t("JOBS_QUEUES_SECTION")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("JOBS_WINDOW", { hours: FAILURE_WINDOW_HOURS })}
          </p>
        </div>
        <MonitoringQueryState
          isEmpty={(data) => data.queues.length === 0}
          retry={queuesQuery.retry}
          state={queuesQuery.state}
        >
          {(data) => (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.queues.map((queue) => (
                <QueueCard backlog={queueBacklog(queue)} key={queue.workload} queue={queue} />
              ))}
            </div>
          )}
        </MonitoringQueryState>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("JOBS_LIST_SECTION")}</h2>
        <MonitoringToolbar
          filters={
            <>
              <Select
                onValueChange={(value) =>
                  update({
                    status: value === "all" ? undefined : (value as JobInternalStatus),
                  })
                }
                value={status ?? "all"}
              >
                <SelectTrigger aria-label={t("STATUS")} className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
                  {JOB_STATUS_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(JOB_STATUS_LABEL_KEYS[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) =>
                  update({
                    workload: value === "all" ? undefined : (value as JobWorkloadClass),
                  })
                }
                value={workload ?? "all"}
              >
                <SelectTrigger aria-label={t("JOBS_WORKLOAD")} className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("JOBS_ALL_WORKLOADS")}</SelectItem>
                  {JOB_WORKLOAD_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(JOB_WORKLOAD_LABEL_KEYS[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
        <MonitoringQueryState
          filtered={filtered}
          isEmpty={(data) => !data.items?.length}
          retry={jobsQuery.retry}
          state={jobsQuery.state}
        >
          {(data) => (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("TIME")}</TableHead>
                    <TableHead>{t("JOB_TYPE")}</TableHead>
                    <TableHead>{t("JOBS_WORKLOAD")}</TableHead>
                    <TableHead>{t("STATUS")}</TableHead>
                    <TableHead>{t("JOB_ATTEMPTS")}</TableHead>
                    <TableHead>{t("JOB_RETRY_AT")}</TableHead>
                    <TableHead>{t("DETAILS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{item.jobType}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("JOB_PROGRESS")}: {item.progressCompleted}
                          {typeof item.progressTotal === "number" ? ` / ${item.progressTotal}` : ""}
                        </span>
                      </TableCell>
                      <TableCell>{t(JOB_WORKLOAD_LABEL_KEYS[item.workload])}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(item.status)}>
                          {t(JOB_STATUS_LABEL_KEYS[item.status])}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.attemptCount}</TableCell>
                      <TableCell>
                        {item.nextAttemptAt ? formatDateTime(item.nextAttemptAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => {
                            setSelectedJobId(item.id);
                            setSelectedJobType(item.jobType);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          {t("DETAILS")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t("PAGE_OF", { page: data.page, pages: data.pages, total: data.total })}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={!data.prev}
                    onClick={() => update({ page: data.prev ?? page })}
                    size="sm"
                    variant="outline"
                  >
                    {t("PREVIOUS")}
                  </Button>
                  <Button
                    disabled={!data.next}
                    onClick={() => update({ page: data.next ?? page })}
                    size="sm"
                    variant="outline"
                  >
                    {t("NEXT")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </MonitoringQueryState>
      </section>
      {selectedJobId && selectedJobType ? (
        <JobDetailSheet
          jobId={selectedJobId}
          jobType={selectedJobType}
          onClose={() => {
            setSelectedJobId(null);
            setSelectedJobType(null);
          }}
        />
      ) : null}
    </MonitoringPage>
  );
}
