import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectorEventInboxStatus } from "@arclayer/platform-openapi";

import { listCommerceProviderEvents } from "@/commerce/commerce-api";
import { PaymentCorrectionPanel } from "@/commerce/payment-correction-dialog";
import { PaymentEvents } from "@/commerce/payment-events-table";
import { PaymentProjections, ProjectionPagination } from "@/commerce/payment-projections";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { CommerceTableToolbar } from "@/components/commerce-data-table";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CommercePaymentsPage() {
  const { t } = useTranslation("commerce");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventProvider, setEventProvider] = useState("");
  const [eventStatus, setEventStatus] = useState<ConnectorEventInboxStatus | undefined>();
  const [eventPage, setEventPage] = useState(1);
  const [eventSortDirection, setEventSortDirection] = useState<"asc" | "desc">("desc");
  const [eventRefreshing, setEventRefreshing] = useState(false);
  const [eventColumns, setEventColumns] = useState(["provider", "event", "status", "attempts"]);
  const load = useCallback(
    () =>
      listCommerceProviderEvents({
        page: eventPage,
        pageSize: 50,
        search: eventSearch || undefined,
        provider: eventProvider || undefined,
        status: eventStatus,
        sortBy: "created_at",
        sortDirection: eventSortDirection,
      }),
    [eventPage, eventProvider, eventSearch, eventSortDirection, eventStatus],
  );
  const { state, retry } = useMonitoringQuery(load, [load]);
  const refreshEvents = () => {
    setEventRefreshing(true);
    retry();
    window.setTimeout(() => setEventRefreshing(false), 300);
  };
  return (
    <CommercePage
      description={t("PAYMENTS_DESCRIPTION")}
      primaryAction={
        <Button onClick={() => setCorrectionOpen(true)}>{t("PAYMENT_CORRECTION_SUBMIT")}</Button>
      }
      secondaryActions={
        <Button disabled={eventRefreshing} onClick={refreshEvents} variant="outline">
          {t("REFRESH")}
        </Button>
      }
      title={t("PAYMENTS_TITLE")}
    >
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => (
          <div className="space-y-4">
            <CommerceTableToolbar
              columnsLabel={t("CHOOSE_COLUMNS")}
              columns={[
                { id: "provider", label: t("PROVIDER") },
                { id: "event", label: t("EVENT") },
                { id: "status", label: t("STATUS") },
                { id: "attempts", label: t("ATTEMPTS") },
              ]}
              filters={
                <div className="flex flex-wrap gap-2">
                  <Input
                    onChange={(event) => {
                      setEventProvider(event.target.value);
                      setEventPage(1);
                    }}
                    placeholder={t("PROVIDER_FILTER_PLACEHOLDER")}
                    value={eventProvider}
                  />
                  <Select
                    onValueChange={(value) => {
                      setEventStatus(
                        value === "all" ? undefined : (value as ConnectorEventInboxStatus),
                      );
                      setEventPage(1);
                    }}
                    value={eventStatus ?? "all"}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder={t("STATUS_FILTER_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
                      <SelectItem value="received">{t("EVENT_STATUS_RECEIVED")}</SelectItem>
                      <SelectItem value="processing">{t("EVENT_STATUS_PROCESSING")}</SelectItem>
                      <SelectItem value="processed">{t("EVENT_STATUS_PROCESSED")}</SelectItem>
                      <SelectItem value="failed">{t("EVENT_STATUS_FAILED")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    onValueChange={(value) => {
                      setEventSortDirection(value as "asc" | "desc");
                      setEventPage(1);
                    }}
                    value={eventSortDirection}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder={t("SORT_ORDER_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{t("SORT_NEWEST")}</SelectItem>
                      <SelectItem value="asc">{t("SORT_OLDEST")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
              onRefresh={() => {
                refreshEvents();
              }}
              onVisibleColumnsChange={(ids) => setEventColumns([...ids])}
              onSearchChange={(value) => {
                setEventSearch(value);
                setEventPage(1);
              }}
              refreshLabel={t("REFRESH")}
              refreshing={eventRefreshing}
              searchPlaceholder={t("PAYMENTS_SEARCH")}
              searchValue={eventSearch}
              visibleColumns={eventColumns}
            />
            <PaymentEvents data={data} onReconciled={retry} visibleColumns={eventColumns} />
          </div>
        )}
      </CommerceQueryState>
      {state.status === "ready" ? (
        <ProjectionPagination
          onNext={() => setEventPage((current) => current + 1)}
          onPrevious={() => setEventPage((current) => Math.max(1, current - 1))}
          page={eventPage}
          pageSize={50}
          total={state.data.total}
        />
      ) : null}
      <PaymentProjections />
      <PaymentCorrectionPanel onOpenChange={setCorrectionOpen} open={correctionOpen} />
    </CommercePage>
  );
}
