import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformDeliveryOperationOut } from "@arclayer/platform-openapi";

import {
  listDeliveryDomainOperations,
  listDeliveryIssueOperations,
  listDeliveryStorageOperations,
} from "@/site-delivery/site-delivery-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";

export type OperationScope =
  | Readonly<{ kind: "issue"; id: string; name: string }>
  | Readonly<{ kind: "domain"; id: string; name: string }>
  | Readonly<{ kind: "storage"; id: string; name: string }>;

export function SiteDeliveryOperationsSheet(props: { scope: OperationScope; onClose: () => void }) {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => {
    if (props.scope.kind === "issue") return listDeliveryIssueOperations(props.scope.id);
    if (props.scope.kind === "domain") return listDeliveryDomainOperations(props.scope.id);
    return listDeliveryStorageOperations(props.scope.id);
  }, [props.scope]);
  const { state, retry } = useMonitoringQuery(load, [load]);

  return (
    <Sheet onOpenChange={(open) => !open && props.onClose()} open>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("OPERATIONS_TITLE", { name: props.scope.name })}</SheetTitle>
          <SheetDescription>{t("OPERATIONS_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-6 pb-8">
          <div className="flex justify-end">
            <Button onClick={retry} size="sm" variant="outline">
              {t("REFRESH")}
            </Button>
          </div>
          {state.status === "loading" ? (
            <Skeleton className="h-40 w-full" />
          ) : state.status === "error" ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyTitle>{t("OPERATIONS_ERROR_TITLE")}</EmptyTitle>
                <EmptyDescription>{t("OPERATIONS_ERROR_DESCRIPTION")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (state.data.items ?? []).length === 0 ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyTitle>{t("OPERATIONS_EMPTY_TITLE")}</EmptyTitle>
                <EmptyDescription>{t("OPERATIONS_EMPTY_DESCRIPTION")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {(state.data.items ?? []).map((operation) => (
                <OperationRow key={operation.id} operation={operation} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OperationRow({ operation }: Readonly<{ operation: PlatformDeliveryOperationOut }>) {
  const { t } = useTranslation("siteDelivery");
  const failed = operation.failedTargetCount > 0;
  return (
    <li className="grid gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{t(`OPERATION_ACTION_${operation.action.toUpperCase()}`)}</p>
        <Badge variant={failed ? "destructive" : "secondary"}>
          {t(`OPERATION_STATE_${operation.state.toUpperCase()}`)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {new Date(operation.createdAt).toLocaleString()}
        {operation.completedAt
          ? ` · ${t("OPERATION_COMPLETED_AT", { time: new Date(operation.completedAt).toLocaleString() })}`
          : ""}
      </p>
      {operation.resultingState ? (
        <p className="text-sm">
          {t("OPERATION_RESULTING_STATE", { state: operation.resultingState })}
        </p>
      ) : null}
      {operation.failureCode ? (
        <p className="font-mono text-xs text-destructive">
          {operation.failureCode}
          {operation.failureMessage ? ` · ${operation.failureMessage}` : ""}
        </p>
      ) : null}
      <p className="font-mono text-xs text-muted-foreground">{operation.id}</p>
    </li>
  );
}
