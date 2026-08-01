import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlatformMonitoringApiError } from "@/monitoring/monitoring-api";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
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

type AsyncState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

export function useMonitoringQuery<T>(load: () => Promise<T>, dependencies: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void load().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [...dependencies, load, retryVersion]);

  return { state, retry: () => setRetryVersion((current) => current + 1) };
}

export function MonitoringPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function MonitoringToolbar({
  filters,
  savedViews,
  warning,
}: Readonly<{ filters: ReactNode; savedViews?: ReactNode; warning?: ReactNode }>) {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center gap-2 p-3">{filters}</div>
      {savedViews ? <div className="border-t px-3 py-2.5">{savedViews}</div> : null}
      {warning ? <div className="border-t p-3">{warning}</div> : null}
    </div>
  );
}

export function MonitoringQueryState<T>({
  state,
  retry,
  isEmpty,
  filtered = false,
  children,
}: Readonly<{
  state: AsyncState<T>;
  retry: () => void;
  isEmpty: (data: T) => boolean;
  filtered?: boolean;
  children: (data: T) => ReactNode;
}>) {
  const { t } = useTranslation("monitoring");
  if (state.status === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label={t("LOADING")}
        aria-live="polite"
        className="space-y-3"
        role="status"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (state.status === "error") {
    const isPermissionError =
      state.error instanceof PlatformMonitoringApiError && state.error.status === 403;
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(isPermissionError ? "PERMISSION_TITLE" : "ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(isPermissionError ? "PERMISSION_DESCRIPTION" : "ERROR_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
        {!isPermissionError && (
          <EmptyContent>
            <Button onClick={retry} variant="outline">
              <RefreshCw aria-hidden="true" />
              {t("RETRY")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }
  if (isEmpty(state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(filtered ? "FILTERED_EMPTY_TITLE" : "EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(filtered ? "FILTERED_EMPTY_DESCRIPTION" : "EMPTY_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return children(state.data);
}

export function MonitoringPartialWarning({ retry }: Readonly<{ retry: () => void }>) {
  const { t } = useTranslation("monitoring");
  return (
    <Alert className="border-warning/40 bg-warning/10">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t("PARTIAL_TITLE")}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{t("PARTIAL_DESCRIPTION")}</span>
        <Button onClick={retry} size="sm" variant="outline">
          {t("RETRY")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
