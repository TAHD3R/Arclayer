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
  loadingVariant?: PageSkeletonVariant;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  errorTitle?: ReactNode;
  errorDescription?: ReactNode;
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

  const retryExtra = useMemo(() => {
    if (!props.onRetry) return null;
    return (
      <Button type="primary" onClick={props.onRetry}>
        {t("common:RETRY")}
      </Button>
    );
  }, [props.onRetry, t]);

  if (props.loading) {
    return (
      <div className={props.className || "py-10"}>
        <PageSkeleton variant={props.loadingVariant ?? "form"} />
      </div>
    );
  }

  if (error) {
    const title = props.errorTitle ?? pickErrorTitle(error, (key) => t(key));
    const details = props.errorDescription ?? getErrorMessage(error);
    const Illustration = pickErrorIllustration(error);

    return (
      <div className={props.className || "py-10"}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia className="mb-0">
              <Illustration className="max-w-[360px]" />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{details}</EmptyDescription>
          </EmptyHeader>
          {retryExtra ? <EmptyContent>{retryExtra}</EmptyContent> : null}
        </Empty>
      </div>
    );
  }

  if (props.empty) {
    return (
      <div className={props.className || "py-10"}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia className="mb-0">
              <OpenDoodlesChilling className="max-w-[360px]" />
            </EmptyMedia>
            <EmptyTitle>{props.emptyTitle ?? t("common:EMPTY_TITLE")}</EmptyTitle>
            <EmptyDescription>{props.emptyDescription ?? t("common:EMPTY_DESC")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return <>{props.children}</>;
}
