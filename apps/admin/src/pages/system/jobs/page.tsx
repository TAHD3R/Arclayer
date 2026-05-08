import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildSystemJobsQueryKey,
  listSystemJobs,
  retrySystemJob,
  type PublishJob,
  type PublishJobStatus,
  type PublishJobType,
} from "@/api/system-jobs";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";

const JOB_STATUS_VALUES: PublishJobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
];
const JOB_TYPE_VALUES: PublishJobType[] = ["scheduled_publish", "manual_publish", "retry"];

function JobStatusTag(props: { status: PublishJobStatus }) {
  const { t } = useTranslation("settings");
  const color =
    props.status === "completed"
      ? "green"
      : props.status === "failed"
        ? "red"
        : props.status === "pending" || props.status === "running"
          ? "gold"
          : "default";
  return (
    <BaseTag color={color}>
      {t(`SETTINGS_SYSTEM_JOBS_STATUS_${props.status.toUpperCase()}`)}
    </BaseTag>
  );
}

function JobRow(props: {
  formatDateTime: (value: string | null | undefined) => string;
  job: PublishJob;
  onRetry: (job: PublishJob) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("settings");
  const canRetry = props.job.status === "failed";

  return (
    <div className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {t(`SETTINGS_SYSTEM_JOBS_TYPE_${props.job.jobType.toUpperCase()}`)}
            </span>
            <JobStatusTag status={props.job.status} />
            {props.job.releaseId ? <BaseTag color="default">#{props.job.releaseId}</BaseTag> : null}
          </div>
          <div className="grid gap-2 text-sm text-label-secondary md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <div className="text-caption text-label-secondary">
                {t("SETTINGS_SYSTEM_JOBS_SCHEDULED_AT")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.formatDateTime(props.job.scheduledAt)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-caption text-label-secondary">
                {t("SETTINGS_SYSTEM_JOBS_STARTED_AT")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.formatDateTime(props.job.startedAt)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-caption text-label-secondary">
                {t("SETTINGS_SYSTEM_JOBS_COMPLETED_AT")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.formatDateTime(props.job.completedAt)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-caption text-label-secondary">
                {t("SETTINGS_SYSTEM_JOBS_CREATED_AT")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.formatDateTime(props.job.createdAt)}
              </div>
            </div>
          </div>
          {props.job.errorMessage ? (
            <div className="rounded-lg border border-red-200/70 bg-red-50/80 px-3 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
              {props.job.errorMessage}
            </div>
          ) : null}
        </div>
        {canRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.pending}
            onClick={() => props.onRetry(props.job)}
          >
            <RotateCcw className="size-4" />
            {t("SETTINGS_SYSTEM_JOBS_RETRY")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SystemJobsPage() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();
  const { formatDateTime } = useAdminDateTimeFormatter({ workspaceId: null });
  const [statusFilter, setStatusFilter] = useState<PublishJobStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<PublishJobType | "all">("all");

  const queryParams = { page: 1, size: 50, status: statusFilter, jobType: typeFilter };
  const jobsQuery = useQuery({
    queryKey: buildSystemJobsQueryKey(queryParams),
    queryFn: async () => listSystemJobs(queryParams),
  });
  const retryMutation = useMutation({
    mutationFn: async (job: PublishJob) => retrySystemJob(job.id),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_JOBS_RETRY_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: ["system", "jobs"] });
    },
    onError: (error) => notifyError(error),
  });

  const jobs = jobsQuery.data?.items ?? [];

  return (
    <ContentGuard
      loading={jobsQuery.isLoading && !jobsQuery.data}
      loadingVariant="table"
      error={jobsQuery.error}
      onRetry={jobsQuery.isError ? () => void jobsQuery.refetch() : undefined}
      empty={!jobsQuery.isLoading && jobs.length === 0}
      emptyTitle={t("settings:SETTINGS_SYSTEM_JOBS_EMPTY_TITLE")}
      emptyDescription={t("settings:SETTINGS_SYSTEM_JOBS_EMPTY_DESC")}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <BaseTag color="default" icon={lucideTagIcon(Filter)}>
            {t("settings:SETTINGS_SYSTEM_JOBS_FILTERS")}
          </BaseTag>
          <select
            aria-label={t("settings:SETTINGS_SYSTEM_JOBS_FILTER_STATUS")}
            className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PublishJobStatus | "all")}
          >
            <option value="all">{t("settings:SETTINGS_SYSTEM_JOBS_FILTER_ALL_STATUSES")}</option>
            {JOB_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {t(`settings:SETTINGS_SYSTEM_JOBS_STATUS_${status.toUpperCase()}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("settings:SETTINGS_SYSTEM_JOBS_FILTER_TYPE")}
            className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as PublishJobType | "all")}
          >
            <option value="all">{t("settings:SETTINGS_SYSTEM_JOBS_FILTER_ALL_TYPES")}</option>
            {JOB_TYPE_VALUES.map((type) => (
              <option key={type} value={type}>
                {t(`settings:SETTINGS_SYSTEM_JOBS_TYPE_${type.toUpperCase()}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={jobsQuery.isFetching}
            onClick={() => void jobsQuery.refetch()}
          >
            <RefreshCw className="size-4" />
            {t("settings:SETTINGS_SYSTEM_JOBS_REFRESH")}
          </Button>
        </div>

        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            formatDateTime={formatDateTime}
            pending={retryMutation.isPending}
            onRetry={(next) => void retryMutation.mutateAsync(next)}
          />
        ))}
      </div>
    </ContentGuard>
  );
}
