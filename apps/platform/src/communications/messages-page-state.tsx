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

export type LoadState<T> = Readonly<{ status: string; data?: T }>;
/** Binds one mutation attempt to the request fingerprint it was issued for. */
export type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

export function MessagesPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <PlatformPage description={description} title={title}>
      {children}
    </PlatformPage>
  );
}

export function MessagesState<T>({
  state,
  retry,
  empty,
  children,
}: Readonly<{
  state: LoadState<T>;
  retry: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}>) {
  const { t } = useTranslation("communications");
  if (state.status === "loading")
    return (
      <div className="space-y-3" aria-busy="true" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  if (!state.data || empty(state.data))
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return children(state.data);
}
