import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlatformAccessApiError } from "@/access/access-api";
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

type AsyncState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

export function useAccessQuery<T>(load: () => Promise<T>, dependencies: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void load().then(
      (data) => !cancelled && setState({ status: "ready", data }),
      (error: unknown) => !cancelled && setState({ status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
  }, [...dependencies, load, version]);
  return { state, retry: () => setVersion((value) => value + 1) };
}

export function AccessPage({
  title,
  description,
  primaryAction,
  extra,
  children,
}: Readonly<{
  title: string;
  description: string;
  primaryAction?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <PlatformPage
      description={description}
      extra={extra}
      primaryAction={primaryAction}
      title={title}
    >
      {children}
    </PlatformPage>
  );
}

export function AccessQueryState<T>({
  state,
  retry,
  isEmpty,
  children,
}: Readonly<{
  state: AsyncState<T>;
  retry: () => void;
  isEmpty: (value: T) => boolean;
  children: (value: T) => ReactNode;
}>) {
  const { t } = useTranslation("access");
  if (state.status === "loading")
    return (
      <div
        aria-busy="true"
        aria-label={t("LOADING")}
        aria-live="polite"
        className="space-y-3"
        role="status"
      >
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (state.status === "error") {
    const denied = state.error instanceof PlatformAccessApiError && state.error.status === 403;
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(denied ? "PERMISSION_TITLE" : "ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>
            {t(denied ? "PERMISSION_DESCRIPTION" : "ERROR_DESCRIPTION")}
          </EmptyDescription>
        </EmptyHeader>
        {!denied && (
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
  if (isEmpty(state.data))
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return children(state.data);
}
