import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PlatformCommerceApiError } from "@/commerce/commerce-api";
import { PlatformPage } from "@/components/platform-page";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function CommercePage(
  props: Readonly<{
    title: string;
    description: string;
    primaryAction?: ReactNode;
    secondaryActions?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
  }>,
) {
  return (
    <PlatformPage
      description={props.description}
      extra={props.extra}
      primaryAction={props.primaryAction}
      secondaryActions={props.secondaryActions}
      title={props.title}
    >
      {props.children}
    </PlatformPage>
  );
}

type AsyncState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

export function CommerceQueryState<T>(
  props: Readonly<{
    state: AsyncState<T>;
    retry: () => void;
    isEmpty: (data: T) => boolean;
    filtered?: boolean;
    children: (data: T) => ReactNode;
  }>,
) {
  const { t } = useTranslation("commerce");
  if (props.state.status === "loading") {
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
  if (props.state.status === "error") {
    const permissionDenied =
      props.state.error instanceof PlatformCommerceApiError && props.state.error.status === 403;
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(permissionDenied ? "PERMISSION_TITLE" : "ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(permissionDenied ? "PERMISSION_DESCRIPTION" : "ERROR_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
        {!permissionDenied && (
          <EmptyContent>
            <Button onClick={props.retry} variant="outline">
              <RefreshCw aria-hidden="true" />
              {t("RETRY")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }
  if (props.isEmpty(props.state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(props.filtered ? "FILTERED_EMPTY_TITLE" : "EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(props.filtered ? "FILTERED_EMPTY_DESCRIPTION" : "EMPTY_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return props.children(props.state.data);
}
