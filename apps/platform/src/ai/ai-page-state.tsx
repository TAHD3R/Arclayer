import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PlatformPage } from "@/components/platform-page";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export type QueryState<T> = { status: string; data?: T };

export function AiPage(
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

export function AiState<T>(
  props: Readonly<{
    state: QueryState<T>;
    retry: () => void;
    empty: (data: T) => boolean;
    children: (data: T) => ReactNode;
  }>,
) {
  const { t } = useTranslation("ai");
  if (props.state.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (props.state.status === "error") {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={props.retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!props.state.data || props.empty(props.state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return props.children(props.state.data);
}
