import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OperationalSignalDetailOut } from "@arclayer/platform-openapi";

import { getOperationalSignal } from "@/operations/operations-api";
import { SignalInvestigation } from "@/operations/signal-investigation";
import { SignalTriageActions } from "@/operations/signal-triage-actions";
import { useOperationsQuery } from "@/operations/operations-state";
import { OperationsFailure } from "@/operations/operations-ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export function SignalDetailSheet({
  signalId,
  summaryTitle,
  onClose,
  onQueueRefresh,
  showDestination = true,
}: Readonly<{
  signalId: string;
  summaryTitle?: string;
  onClose: () => void;
  onQueueRefresh: () => void;
  showDestination?: boolean;
}>) {
  const { t } = useTranslation("inbox");
  const load = useCallback(
    (signal: AbortSignal) => getOperationalSignal(signalId, signal),
    [signalId],
  );
  const { state, retry } = useOperationsQuery(load, [signalId]);
  const [reloading, setReloading] = useState(false);
  const [updatedDetail, setUpdatedDetail] = useState<OperationalSignalDetailOut | null>(null);
  useEffect(() => {
    setReloading(false);
    setUpdatedDetail(null);
  }, [signalId]);
  useEffect(() => {
    if (state.status === "ready" && !state.refreshing) setReloading(false);
  }, [state]);
  const detail = reloading
    ? null
    : (updatedDetail ?? (state.status === "ready" ? state.data : null));
  const reload = () => {
    setReloading(true);
    setUpdatedDetail(null);
    retry();
  };
  const handleUpdated = (nextDetail: OperationalSignalDetailOut) => {
    setUpdatedDetail(nextDetail);
    onQueueRefresh();
  };

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-2xl"
        closeButtonLabel={t("CLOSE_DETAILS")}
      >
        <SheetHeader>
          <SheetTitle>
            {detail ? t(detail.copy.titleKey) : (summaryTitle ?? t("DETAIL_TITLE"))}
          </SheetTitle>
          <SheetDescription>{t("DETAIL_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-8">
          {(state.status === "loading" || reloading) && (
            <div aria-label={t("DETAIL_LOADING")} className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {state.status === "error" && <OperationsFailure error={state.error} retry={retry} />}
          {detail && (
            <SignalInvestigation
              actions={
                <SignalTriageActions detail={detail} onReload={reload} onUpdated={handleUpdated} />
              }
              detail={detail}
              showDestination={showDestination}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
