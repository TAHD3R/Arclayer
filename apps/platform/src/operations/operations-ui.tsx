import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PlatformOperationsApiError } from "@/operations/operations-api";
import type { OperationsQueryState } from "@/operations/operations-state";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

export function OperationsPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function OperationsQueryBoundary<T>({
  state,
  retry,
  empty,
  filtered,
  children,
}: Readonly<{
  state: OperationsQueryState<T>;
  retry: () => void;
  empty: (data: T) => boolean;
  filtered: boolean;
  children: (data: T, refreshing: boolean) => ReactNode;
}>) {
  const { t } = useTranslation("inbox");
  if (state.status === "loading") {
    return (
      <div aria-label={t("QUEUE_LOADING")} className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (state.status === "error") {
    return <OperationsFailure error={state.error} retry={retry} />;
  }
  if (empty(state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(filtered ? "FILTERED_EMPTY_TITLE" : "QUEUE_EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(filtered ? "FILTERED_EMPTY_DESCRIPTION" : "QUEUE_EMPTY_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return children(state.data, state.refreshing);
}

export function OperationsFailure({
  error,
  retry,
}: Readonly<{ error: unknown; retry?: () => void }>) {
  const { t, i18n } = useTranslation(["inbox", "errors"]);
  const apiError = error instanceof PlatformOperationsApiError ? error : null;
  const permissionDenied = apiError?.status === 403;
  const conflict = apiError?.status === 409;
  const codeKey = apiError ? `errors:${apiError.message}` : null;
  const hasSpecificCopy = Boolean(codeKey && i18n.exists(codeKey));
  const title = permissionDenied
    ? t("inbox:PERMISSION_TITLE")
    : conflict
      ? t("inbox:CONFLICT_TITLE")
      : t("inbox:ERROR_TITLE");
  const description = hasSpecificCopy
    ? t(codeKey!)
    : t(
        permissionDenied
          ? "inbox:PERMISSION_DESCRIPTION"
          : conflict
            ? "inbox:CONFLICT_DESCRIPTION"
            : "inbox:ERROR_DESCRIPTION",
      );

  return (
    <Alert className={conflict ? "border-warning/40 bg-warning/10" : undefined}>
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {apiError && (
          <p className="font-mono text-caption" data-testid="operations-error-code">
            {apiError.message}
          </p>
        )}
        {retry && !permissionDenied && (
          <Button onClick={retry} size="sm" variant="outline">
            <RefreshCw aria-hidden="true" />
            {t(conflict ? "inbox:RELOAD_CURRENT" : "inbox:RETRY")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function RefreshStatus({ refreshing }: Readonly<{ refreshing: boolean }>) {
  const { t } = useTranslation("inbox");
  if (!refreshing) return null;
  return (
    <p aria-live="polite" className="text-footnote text-label-secondary">
      {t("QUEUE_REFRESHING")}
    </p>
  );
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatAge(seconds: number): string {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (seconds < 60) return formatter.format(-Math.max(1, seconds), "second");
  if (seconds < 3_600) return formatter.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86_400) return formatter.format(-Math.round(seconds / 3_600), "hour");
  return formatter.format(-Math.round(seconds / 86_400), "day");
}
