import { Button } from "antd";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/utils/notifications";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  OpenDoodlesChilling,
  OpenDoodlesClumsy,
  OpenDoodlesHouseplant,
} from "@/components/illustrations/openDoodles";
import { PageSkeleton, type PageSkeletonVariant } from "@/components/app/pageSkeleton";

export type PageStateProps = {
  loading: boolean;
  error?: unknown | null;
  empty?: boolean;
  onRetry?: () => void;
  /** Compact mode for tight containers (e.g. onboarding cards) to avoid unnecessary scroll. */
  variant?: "default" | "compact";
  /** Hide the built-in retry button (use `errorExtra` for custom action layout). */
  hideRetry?: boolean;
  loadingVariant?: PageSkeletonVariant;
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
    if (err.status === 403) return t("common:PAGE_FORBIDDEN_TITLE");
    if (err.status >= 500) return t("common:PAGE_SERVER_ERROR_TITLE");
  }
  return t("common:REQUEST_FAILED");
}

function pickErrorIllustration(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 403) return OpenDoodlesHouseplant;
    if (err.status >= 500) return OpenDoodlesClumsy;
  }
  return OpenDoodlesClumsy;
}

export function PageState(props: PageStateProps) {
  const { t } = useTranslation();

  const error = props.error ?? null;
  const variant = props.variant ?? "default";
  const wrapperClassName = props.className || (variant === "compact" ? "py-6" : "py-10");
  const emptyClassName = variant === "compact" ? "gap-4 p-4 md:p-8" : undefined;
  const titleClassName = variant === "compact" ? "text-2xl md:text-3xl" : undefined;
  const descriptionClassName = variant === "compact" ? "text-sm md:text-base" : undefined;
  const illustrationClassName = variant === "compact" ? "max-w-[260px]" : "max-w-[360px]";

  const retryExtra = useMemo(() => {
    if (props.hideRetry) return null;
    if (!props.onRetry) return null;
    return (
      <Button type="primary" onClick={props.onRetry}>
        {t("common:RETRY")}
      </Button>
    );
  }, [props.onRetry, t]);

  if (props.loading) {
    return (
      <div className={wrapperClassName}>
        <PageSkeleton variant={props.loadingVariant ?? "form"} />
      </div>
    );
  }

  if (error) {
    const title = props.errorTitle ?? pickErrorTitle(error, (key) => t(key));
    const details = props.errorDescription ?? getErrorMessage(error);
    const Illustration = pickErrorIllustration(error);
    const hasExtra = Boolean(retryExtra) || Boolean(props.errorExtra);

    return (
      <div className={wrapperClassName}>
        <Empty className={emptyClassName}>
          <EmptyHeader>
            <EmptyMedia className="mb-0">
              <Illustration className={illustrationClassName} />
            </EmptyMedia>
            <EmptyTitle className={titleClassName}>{title}</EmptyTitle>
            <EmptyDescription className={descriptionClassName}>{details}</EmptyDescription>
          </EmptyHeader>
          {hasExtra ? (
            <EmptyContent>
              {retryExtra}
              {props.errorExtra}
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  if (props.empty) {
    const hasExtra = Boolean(props.emptyExtra);
    return (
      <div className={wrapperClassName}>
        <Empty className={emptyClassName}>
          <EmptyHeader>
            <EmptyMedia className="mb-0">
              <OpenDoodlesChilling className={illustrationClassName} />
            </EmptyMedia>
            <EmptyTitle className={titleClassName}>
              {props.emptyTitle ?? t("common:EMPTY_TITLE")}
            </EmptyTitle>
            <EmptyDescription className={descriptionClassName}>
              {props.emptyDescription ?? t("common:EMPTY_DESC")}
            </EmptyDescription>
          </EmptyHeader>
          {hasExtra ? <EmptyContent>{props.emptyExtra}</EmptyContent> : null}
        </Empty>
      </div>
    );
  }

  return <>{props.children}</>;
}
