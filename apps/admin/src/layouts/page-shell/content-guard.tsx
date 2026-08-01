import { useMemo, type ReactNode } from "react";
import {
  FileWarning,
  Gauge,
  Inbox,
  LockKeyhole,
  SearchX,
  ServerCrash,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ErrorReportButton } from "@/components/feedback/error-report-button";
import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/lib/notifications";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { PageSkeleton, type PageSkeletonVariant } from "@arclayer/ui/page-skeleton";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { Button } from "@arclayer/ui/button";

export type ContentGuardProps = {
  loading: boolean;
  error?: unknown | null;
  empty?: boolean;
  onRetry?: () => void;
  /** Compact mode for tight containers (e.g. onboarding cards) to avoid unnecessary scroll. */
  variant?: "default" | "compact";
  /** Control whether to show illustrations for empty/error states. */
  mediaVariant?: "illustration" | "none";
  /** Hide the built-in retry button (use `errorExtra` for custom action layout). */
  hideRetry?: boolean;
  loadingVariant?: PageSkeletonVariant;
  /**
   * Wrap loading/error/empty states in an admin route container.
   * This keeps pending UI aligned with `DefaultPage` indentation.
   */
  container?: "raw" | "admin-route";
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyExtra?: ReactNode;
  errorTitle?: ReactNode;
  errorDescription?: ReactNode;
  errorExtra?: ReactNode;
  wrapperSpacing?: "default" | "flush";
  className?: string;
  children?: ReactNode;
};

function pickErrorTitle(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("common:PAGE_UNAUTHORIZED_TITLE");
    if (err.status === 403) return t("common:PAGE_FORBIDDEN_TITLE");
    if (err.status === 404) return t("common:PAGE_NOT_FOUND_TITLE");
    if (err.status === 422) return t("common:PAGE_VALIDATION_TITLE");
    if (err.status === 429) return t("common:PAGE_RATE_LIMIT_TITLE");
    if (err.status >= 500) return t("common:PAGE_SERVER_ERROR_TITLE");
  }
  return t("common:REQUEST_FAILED");
}

function pickErrorDescription(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("common:PAGE_UNAUTHORIZED_DESC");
    if (err.status === 403) return t("common:PAGE_FORBIDDEN_DESC");
    if (err.status === 404) return t("common:PAGE_NOT_FOUND_DESC");
    if (err.status === 422) return t("common:PAGE_VALIDATION_DESC");
    if (err.status === 429) return t("common:PAGE_RATE_LIMIT_DESC");
    if (err.status >= 500) return t("common:PAGE_SERVER_ERROR_DESC");
    return getErrorMessage(err);
  }

  // Never surface internal details for unexpected runtime errors in page-level guards.
  return t("common:PAGE_SERVER_ERROR_DESC");
}

function pickErrorIcon(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 401) return LockKeyhole;
    if (err.status === 403) return ShieldX;
    if (err.status === 404) return SearchX;
    if (err.status === 422) return FileWarning;
    if (err.status === 429) return Gauge;
    if (err.status >= 500) return ServerCrash;
  }
  return TriangleAlert;
}

function canReportError(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500;
}

export function ContentGuard(props: ContentGuardProps) {
  const { t } = useTranslation();

  const error = props.error ?? null;
  const variant = props.variant ?? "default";
  const mediaVariant = props.mediaVariant ?? "illustration";
  const wrapperSpacing = props.wrapperSpacing ?? "default";
  const wrapperClassName =
    props.className ||
    (wrapperSpacing === "flush" ? "py-0" : variant === "compact" ? "py-6" : "py-10");
  const container = props.container ?? "raw";
  const emptyClassName = variant === "compact" ? "gap-4 p-4 md:p-8" : undefined;
  const retryExtra = useMemo(() => {
    if (props.hideRetry) return null;
    if (!props.onRetry) return null;
    return (
      <Button size="lg" onClick={props.onRetry}>
        {t("common:RETRY")}
      </Button>
    );
  }, [props.onRetry, t, props.hideRetry]);

  if (props.loading) {
    const content = <PageSkeleton variant={props.loadingVariant ?? "form"} />;

    if (container === "admin-route") {
      return (
        <AdminRouteContainer>
          <div aria-busy="true" aria-label={t("common:LOADING")} aria-live="polite" role="status">
            {content}
          </div>
        </AdminRouteContainer>
      );
    }

    return (
      <div
        aria-busy="true"
        aria-label={t("common:LOADING")}
        aria-live="polite"
        className={wrapperClassName}
        role="status"
      >
        {content}
      </div>
    );
  }

  if (error) {
    const title = props.errorTitle ?? pickErrorTitle(error, (key) => t(key));
    const details = props.errorDescription ?? pickErrorDescription(error, (key) => t(key));
    const ErrorIcon = pickErrorIcon(error);
    const reportExtra = canReportError(error) ? <ErrorReportButton error={error} /> : null;
    const hasExtra = Boolean(retryExtra) || Boolean(props.errorExtra) || Boolean(reportExtra);

    const content = (
      <Empty className={emptyClassName}>
        <EmptyHeader>
          {mediaVariant === "illustration" ? (
            <EmptyMedia variant="icon">
              <ErrorIcon className="size-6" aria-hidden="true" />
            </EmptyMedia>
          ) : null}
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{details}</EmptyDescription>
        </EmptyHeader>
        {hasExtra ? (
          <EmptyContent className="flex-row flex-wrap justify-center gap-2">
            {retryExtra}
            {reportExtra}
            {props.errorExtra}
          </EmptyContent>
        ) : null}
      </Empty>
    );

    if (container === "admin-route") {
      return <AdminRouteContainer>{content}</AdminRouteContainer>;
    }

    return <div className={wrapperClassName}>{content}</div>;
  }

  if (props.empty) {
    const hasExtra = Boolean(props.emptyExtra);
    const content = (
      <Empty className={emptyClassName}>
        <EmptyHeader>
          {mediaVariant === "illustration" ? (
            <EmptyMedia variant="icon">
              <Inbox className="size-6" aria-hidden="true" />
            </EmptyMedia>
          ) : null}
          <EmptyTitle>{props.emptyTitle ?? t("common:EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{props.emptyDescription ?? t("common:EMPTY_DESC")}</EmptyDescription>
        </EmptyHeader>
        {hasExtra ? <EmptyContent>{props.emptyExtra}</EmptyContent> : null}
      </Empty>
    );

    if (container === "admin-route") {
      return <AdminRouteContainer>{content}</AdminRouteContainer>;
    }

    return <div className={wrapperClassName}>{content}</div>;
  }

  return <>{props.children}</>;
}
