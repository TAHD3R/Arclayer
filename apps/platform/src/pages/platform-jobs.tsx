import { ArrowLeft, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getOperationalSignal } from "@/operations/operations-api";
import type { PlatformJobsSearch } from "@/operations/operations-routing";
import { SignalInvestigation } from "@/operations/signal-investigation";
import { useOperationsQuery } from "@/operations/operations-state";
import { OperationsFailure, OperationsPage } from "@/operations/operations-ui";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

export function PlatformJobsPage({ search }: Readonly<{ search: PlatformJobsSearch }>) {
  const { t } = useTranslation("inbox");
  return (
    <OperationsPage description={t("JOBS_PAGE_DESCRIPTION")} title={t("JOBS_PAGE_TITLE")}>
      <Button asChild className="w-fit" variant="ghost">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          {t("BACK_TO_INBOX")}
        </Link>
      </Button>
      {search.jobId ? <JobInvestigation jobId={search.jobId} /> : <NoJobSelected />}
    </OperationsPage>
  );
}

function NoJobSelected() {
  const { t } = useTranslation("inbox");
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("JOB_NOT_SELECTED_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("JOB_NOT_SELECTED_DESCRIPTION")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">{t("OPEN_INBOX")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function JobInvestigation({ jobId }: Readonly<{ jobId: string }>) {
  const { t } = useTranslation("inbox");
  const load = useCallback((signal: AbortSignal) => getOperationalSignal(jobId, signal), [jobId]);
  const { state, retry } = useOperationsQuery(load, [jobId]);

  if (state.status === "loading") {
    return (
      <div aria-label={t("JOB_LOADING")} className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state.status === "error") return <OperationsFailure error={state.error} retry={retry} />;
  return (
    <article className="rounded-lg border bg-card p-5 md:p-7">
      <SignalInvestigation detail={state.data} showDestination={false} />
    </article>
  );
}
