import { Button } from "antd";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/lib/notifications";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@celestial/ui/empty";
import {
  Illust401LockedTerminal,
  Illust403ForbiddenGateway,
  Illust404BrokenLink,
  Illust422MalformedPacket,
  Illust429OverloadedGauge,
  Illust500CrashedServer,
  IllustEmptyContainer,
} from "@celestial/ui/illustrations";
import { PageSkeleton, type PageSkeletonVariant } from "@celestial/ui/page-skeleton";
import {
  AdminRouteContainer,
  type AdminRouteContainerWidth,
} from "@/components/layout/admin-route-container";

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
  containerWidth?: AdminRouteContainerWidth;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyExtra?: ReactNode;
  errorTitle?: ReactNode;
  errorDescription?: ReactNode;
  errorExtra?: ReactNode;
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

function pickErrorIllustration(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 401) return Illust401LockedTerminal;
    if (err.status === 403) return Illust403ForbiddenGateway;
    if (err.status === 404) return Illust404BrokenLink;
    if (err.status === 422) return Illust422MalformedPacket;
    if (err.status === 429) return Illust429OverloadedGauge;
    if (err.status >= 500) return Illust500CrashedServer;
  }
  return Illust500CrashedServer;
}

export function ContentGuard(props: ContentGuardProps) {
  const { t } = useTranslation();

  const error = props.error ?? null;
  const variant = props.variant ?? "default";
  const mediaVariant = props.mediaVariant ?? "illustration";
  const wrapperClassName = props.className || (variant === "compact" ? "py-6" : "py-10");
  const container = props.container ?? "raw";
  const containerWidth = props.containerWidth ?? "fixed";
  const emptyClassName = variant === "compact" ? "gap-4 p-4 md:p-8" : undefined;
  const titleClassName = variant === "compact" ? "text-title md:text-largetitle" : undefined;
  const descriptionClassName = variant === "compact" ? "text-footnote md:text-body" : undefined;
  const illustrationClassName = variant === "compact" ? "max-w-[260px]" : "max-w-[360px]";

  const retryExtra = useMemo(() => {
    if (props.hideRetry) return null;
    if (!props.onRetry) return null;
    return (
      <Button type="primary" size="large" onClick={props.onRetry} autoInsertSpace={false}>
        {t("common:RETRY")}
      </Button>
    );
  }, [props.onRetry, t, props.hideRetry]);

  if (props.loading) {
    const content = <PageSkeleton variant={props.loadingVariant ?? "form"} />;

    if (container === "admin-route") {
      return <AdminRouteContainer width={containerWidth}>{content}</AdminRouteContainer>;
    }

    return <div className={wrapperClassName}>{content}</div>;
  }

  if (error) {
    const title = props.errorTitle ?? pickErrorTitle(error, (key) => t(key));
    const details = props.errorDescription ?? pickErrorDescription(error, (key) => t(key));
    const Illustration = pickErrorIllustration(error);
    const hasExtra = Boolean(retryExtra) || Boolean(props.errorExtra);

    const content = (
      <Empty className={emptyClassName}>
        <EmptyHeader>
          {mediaVariant === "illustration" ? (
            <EmptyMedia className="mb-0">
              <Illustration className={illustrationClassName} />
            </EmptyMedia>
          ) : null}
          <EmptyTitle className={titleClassName}>{title}</EmptyTitle>
          <EmptyDescription className={descriptionClassName}>{details}</EmptyDescription>
        </EmptyHeader>
        {hasExtra ? (
          <EmptyContent>
            {props.errorExtra}
            {retryExtra}
          </EmptyContent>
        ) : null}
      </Empty>
    );

    if (container === "admin-route") {
      return <AdminRouteContainer width={containerWidth}>{content}</AdminRouteContainer>;
    }

    return <div className={wrapperClassName}>{content}</div>;
  }

  if (props.empty) {
    const hasExtra = Boolean(props.emptyExtra);
    const content = (
      <Empty className={emptyClassName}>
        <EmptyHeader>
          {mediaVariant === "illustration" ? (
            <EmptyMedia className="mb-0">
              <IllustEmptyContainer className={illustrationClassName} />
            </EmptyMedia>
          ) : null}
          <EmptyTitle className={titleClassName}>
            {props.emptyTitle ?? t("common:EMPTY_TITLE")}
          </EmptyTitle>
          <EmptyDescription className={descriptionClassName}>
            {props.emptyDescription ?? t("common:EMPTY_DESC")}
          </EmptyDescription>
        </EmptyHeader>
        {hasExtra ? <EmptyContent>{props.emptyExtra}</EmptyContent> : null}
      </Empty>
    );

    if (container === "admin-route") {
      return <AdminRouteContainer width={containerWidth}>{content}</AdminRouteContainer>;
    }

    return <div className={wrapperClassName}>{content}</div>;
  }

  return <>{props.children}</>;
}
