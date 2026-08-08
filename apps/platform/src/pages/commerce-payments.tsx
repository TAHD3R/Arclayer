import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ConnectorEventInboxStatus,
  CommerceInvoiceStatus,
  CommerceRefundStatus,
  CommerceTransactionKind,
  CommerceTransactionStatus,
  PlatformInvoiceListOut,
  PlatformRefundListOut,
  PlatformTransactionListOut,
  ProviderEventListOut,
} from "@arclayer/platform-openapi";

import {
  listCommerceProviderEvents,
  listCommerceInvoices,
  listCommerceRefunds,
  listCommerceTransactions,
  recordCommercePaymentCorrection,
  reconcileCommerceProviderEvent,
  requestCommerceTopUpRefund,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { CommerceTableToolbar, type CommerceColumn } from "@/components/commerce-data-table";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

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

type CorrectionForm = Readonly<{
  providerAccountId: string;
  providerEventId: string;
  externalTransactionId: string;
  externalRefundId: string;
  currency: string;
  amountMicros: string;
  amountRefundedMicros: string;
  creditAmount: string;
  providerEventOccurredAt: string;
  reason: string;
  evidenceReference: string;
}>;

const EMPTY_CORRECTION: CorrectionForm = {
  providerAccountId: "",
  providerEventId: "",
  externalTransactionId: "",
  externalRefundId: "",
  currency: "USD",
  amountMicros: "",
  amountRefundedMicros: "",
  creditAmount: "",
  providerEventOccurredAt: "",
  reason: "",
  evidenceReference: "",
};

function PaymentCorrectionPanel(
  props: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>,
) {
  const { t } = useTranslation("commerce");
  const [form, setForm] = useState<CorrectionForm>(EMPTY_CORRECTION);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const attempt = useRef<IdempotencyAttempt | null>(null);

  const update = (field: keyof CorrectionForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(form.amountMicros);
    const refunded = Number(form.amountRefundedMicros);
    const credits = Number(form.creditAmount);
    if (
      !form.providerAccountId.trim() ||
      !form.providerEventId.trim() ||
      !form.externalTransactionId.trim() ||
      !form.providerEventOccurredAt.trim() ||
      !form.reason.trim() ||
      !form.evidenceReference.trim() ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(refunded) ||
      refunded < 0 ||
      refunded > amount ||
      !Number.isSafeInteger(credits) ||
      credits <= 0
    ) {
      setError(t("PAYMENT_CORRECTION_INVALID"));
      setResult(null);
      return;
    }
    const fingerprint = JSON.stringify({ ...form, amount, refunded, credits });
    const current = attempt.current?.fingerprint === fingerprint ? attempt.current : null;
    const next = current ?? { fingerprint, key: crypto.randomUUID() };
    attempt.current = next;
    setPending(true);
    setError(null);
    try {
      const response = await recordCommercePaymentCorrection({
        provider: "stripe",
        providerMode: "test",
        providerAccountId: form.providerAccountId.trim(),
        providerEventId: form.providerEventId.trim(),
        externalTransactionId: form.externalTransactionId.trim(),
        externalInvoiceId: null,
        externalRefundId: form.externalRefundId.trim() || null,
        transactionStatus: "succeeded",
        invoiceStatus: null,
        refundStatus: form.externalRefundId.trim() ? "succeeded" : null,
        currency: form.currency.trim().toUpperCase(),
        amountMicros: amount,
        amountRefundedMicros: refunded,
        creditAmount: credits,
        providerEventOccurredAt: form.providerEventOccurredAt,
        reason: form.reason.trim(),
        evidenceReference: form.evidenceReference.trim(),
        idempotencyKey: next.key,
      });
      setResult(
        t("PAYMENT_CORRECTION_RECORDED", {
          status: t(
            response.disposition === "applied"
              ? "PAYMENT_CORRECTION_APPLIED"
              : response.disposition === "replayed"
                ? "PAYMENT_CORRECTION_REPLAYED"
                : "PAYMENT_CORRECTION_RECONCILIATION_REQUIRED",
          ),
        }),
      );
      if (attempt.current === next) attempt.current = null;
    } catch {
      setError(t("PAYMENT_CORRECTION_ERROR"));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("PAYMENT_CORRECTION_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="payment-correction-form" type="submit">
            {pending ? t("PAYMENT_CORRECTION_SAVING") : t("SAVE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("PAYMENT_CORRECTION_TITLE")}
    >
      <form className="grid gap-4" id="payment-correction-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["providerAccountId", "PAYMENT_CORRECTION_ACCOUNT"],
              ["providerEventId", "PAYMENT_CORRECTION_EVENT"],
              ["externalTransactionId", "PAYMENT_CORRECTION_TRANSACTION"],
              ["externalRefundId", "PAYMENT_CORRECTION_REFUND"],
              ["currency", "PAYMENT_CORRECTION_CURRENCY"],
              ["amountMicros", "PAYMENT_CORRECTION_AMOUNT"],
              ["amountRefundedMicros", "PAYMENT_CORRECTION_REFUNDED"],
              ["creditAmount", "PAYMENT_CORRECTION_CREDITS"],
              ["providerEventOccurredAt", "PAYMENT_CORRECTION_OCCURRED_AT"],
            ] as const
          ).map(([field, label]) => (
            <label
              className="grid gap-1 text-sm"
              htmlFor={`payment-correction-${field}`}
              key={field}
            >
              <span>{t(label)}</span>
              <Input
                id={`payment-correction-${field}`}
                inputMode={
                  field.includes("Micros") || field === "creditAmount" ? "numeric" : undefined
                }
                onChange={(event) => update(field, event.target.value)}
                placeholder={t(label)}
                value={form[field]}
              />
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm" htmlFor="payment-correction-reason">
            <span>{t("REASON")}</span>
            <Input
              id="payment-correction-reason"
              onChange={(event) => update("reason", event.target.value)}
              placeholder={t("PAYMENT_CORRECTION_REASON_PLACEHOLDER")}
              value={form.reason}
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="payment-correction-evidence">
            <span>{t("EVIDENCE_REFERENCE")}</span>
            <Input
              id="payment-correction-evidence"
              onChange={(event) => update("evidenceReference", event.target.value)}
              placeholder={t("EVIDENCE_REFERENCE_DESCRIPTION")}
              value={form.evidenceReference}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
        </div>
      </form>
    </SettingDialog>
  );
}

function PaymentProjections() {
  const { t } = useTranslation("commerce");
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [sortBy, setSortBy] = useState("occurred_at");
  const [projectionProvider, setProjectionProvider] = useState("");
  const [projectionStatus, setProjectionStatus] = useState<
    CommerceTransactionStatus | CommerceInvoiceStatus | CommerceRefundStatus | undefined
  >();
  const [projectionKind, setProjectionKind] = useState<CommerceTransactionKind | undefined>();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("transactions");
  const [refreshing, setRefreshing] = useState(false);
  const transactions = useMonitoringQuery(
    () =>
      listCommerceTransactions({
        page,
        pageSize: 25,
        provider: projectionProvider || undefined,
        status:
          activeTab === "transactions"
            ? (projectionStatus as CommerceTransactionStatus | undefined)
            : undefined,
        kind: projectionKind,
        search: search || undefined,
        sortBy: sortBy === "amount_micros" || sortBy === "status" ? sortBy : "occurred_at",
        sortDirection,
      }),
    [
      activeTab,
      page,
      projectionKind,
      projectionProvider,
      projectionStatus,
      search,
      sortBy,
      sortDirection,
    ],
  );
  const invoices = useMonitoringQuery(
    () =>
      listCommerceInvoices({
        page,
        pageSize: 25,
        provider: projectionProvider || undefined,
        status:
          activeTab === "invoices"
            ? (projectionStatus as CommerceInvoiceStatus | undefined)
            : undefined,
        search: search || undefined,
        sortBy: sortBy === "amount_due_micros" || sortBy === "status" ? sortBy : "issued_at",
        sortDirection,
      }),
    [activeTab, page, projectionProvider, projectionStatus, search, sortBy, sortDirection],
  );
  const refunds = useMonitoringQuery(
    () =>
      listCommerceRefunds({
        page,
        pageSize: 25,
        status:
          activeTab === "refunds"
            ? (projectionStatus as CommerceRefundStatus | undefined)
            : undefined,
        search: search || undefined,
        sortBy: sortBy === "amount_micros" || sortBy === "status" ? sortBy : "created_at",
        sortDirection,
      }),
    [activeTab, page, projectionStatus, search, sortBy, sortDirection],
  );
  const refresh = () => {
    setRefreshing(true);
    transactions.retry();
    invoices.retry();
    refunds.retry();
    window.setTimeout(() => setRefreshing(false), 300);
  };
  const projectionColumns: Record<string, readonly CommerceColumn[]> = {
    transactions: [
      { id: "reference", label: t("REFERENCE") },
      { id: "provider", label: t("PROVIDER") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "occurred", label: t("OCCURRED_AT") },
      { id: "actions", label: t("ACTION") },
    ],
    invoices: [
      { id: "reference", label: t("REFERENCE") },
      { id: "provider", label: t("PROVIDER") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "issued", label: t("ISSUED_AT") },
    ],
    refunds: [
      { id: "reference", label: t("REFERENCE") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "reason", label: t("REASON") },
      { id: "completed", label: t("COMPLETED_AT") },
    ],
  };
  const [visibleProjectionColumns, setVisibleProjectionColumns] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      Object.entries(projectionColumns).map(([key, columns]) => [
        key,
        columns.map((column) => column.id),
      ]),
    ),
  );
  const columns = projectionColumns[activeTab] ?? projectionColumns.transactions;
  const visibleColumns = visibleProjectionColumns[activeTab] ?? columns.map((column) => column.id);
  return (
    <div className="space-y-3 overflow-hidden rounded-lg border bg-card p-3">
      <CommerceTableToolbar
        columns={columns}
        columnsLabel={t("CHOOSE_COLUMNS")}
        filters={
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-36"
              onChange={(event) => {
                setProjectionProvider(event.target.value);
                setPage(1);
              }}
              placeholder={t("PROVIDER_FILTER_PLACEHOLDER")}
              value={projectionProvider}
            />
            <Select
              onValueChange={(value) => {
                setProjectionStatus(
                  value === "all" ? undefined : (value as typeof projectionStatus),
                );
                setPage(1);
              }}
              value={projectionStatus ?? "all"}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("STATUS_FILTER_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
                {activeTab === "transactions" ? (
                  <>
                    <SelectItem value="pending">{t("PAYMENT_STATUS_PENDING")}</SelectItem>
                    <SelectItem value="succeeded">{t("PAYMENT_STATUS_SUCCEEDED")}</SelectItem>
                    <SelectItem value="failed">{t("PAYMENT_STATUS_FAILED")}</SelectItem>
                    <SelectItem value="refunded">{t("PAYMENT_STATUS_REFUNDED")}</SelectItem>
                  </>
                ) : activeTab === "invoices" ? (
                  <>
                    <SelectItem value="open">{t("INVOICE_STATUS_OPEN")}</SelectItem>
                    <SelectItem value="paid">{t("INVOICE_STATUS_PAID")}</SelectItem>
                    <SelectItem value="void">{t("INVOICE_STATUS_VOID")}</SelectItem>
                    <SelectItem value="uncollectible">
                      {t("INVOICE_STATUS_UNCOLLECTIBLE")}
                    </SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="pending">{t("REFUND_STATUS_PENDING")}</SelectItem>
                    <SelectItem value="succeeded">{t("REFUND_STATUS_SUCCEEDED")}</SelectItem>
                    <SelectItem value="failed">{t("REFUND_STATUS_FAILED")}</SelectItem>
                    <SelectItem value="canceled">{t("REFUND_STATUS_CANCELED")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {activeTab === "transactions" ? (
              <Select
                onValueChange={(value) => {
                  setProjectionKind(
                    value === "all" ? undefined : (value as CommerceTransactionKind),
                  );
                  setPage(1);
                }}
                value={projectionKind ?? "all"}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={t("KIND_FILTER_PLACEHOLDER")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("ALL_KINDS")}</SelectItem>
                  <SelectItem value="subscription">{t("KIND_SUBSCRIPTION")}</SelectItem>
                  <SelectItem value="renewal">{t("KIND_RENEWAL")}</SelectItem>
                  <SelectItem value="top_up">{t("KIND_TOP_UP")}</SelectItem>
                  <SelectItem value="refund">{t("KIND_REFUND")}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Select
              onValueChange={(value) => {
                setSortBy(value);
                setPage(1);
              }}
              value={sortBy}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("SORT_FIELD_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent>
                {activeTab === "transactions" ? (
                  <>
                    <SelectItem value="occurred_at">{t("OCCURRED_AT")}</SelectItem>
                    <SelectItem value="amount_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                ) : activeTab === "invoices" ? (
                  <>
                    <SelectItem value="issued_at">{t("ISSUED_AT")}</SelectItem>
                    <SelectItem value="amount_due_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="created_at">{t("CREATED_AT")}</SelectItem>
                    <SelectItem value="amount_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => setSortDirection(value as "asc" | "desc")}
              value={sortDirection}
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
        onRefresh={refresh}
        onVisibleColumnsChange={(ids) =>
          setVisibleProjectionColumns((current) => ({ ...current, [activeTab]: [...ids] }))
        }
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        refreshLabel={t("REFRESH")}
        refreshing={refreshing}
        searchPlaceholder={t("PAYMENT_PROJECTIONS_SEARCH")}
        searchValue={search}
        visibleColumns={visibleColumns}
      />
      <Tabs
        onValueChange={(value) => {
          setActiveTab(value);
          setPage(1);
          setProjectionStatus(undefined);
          setProjectionKind(undefined);
          setSortBy(
            value === "transactions"
              ? "occurred_at"
              : value === "invoices"
                ? "issued_at"
                : "created_at",
          );
        }}
        value={activeTab}
      >
        <div className="border-b p-3">
          <TabsList>
            <TabsTrigger value="transactions">{t("TRANSACTIONS")}</TabsTrigger>
            <TabsTrigger value="invoices">{t("INVOICES")}</TabsTrigger>
            <TabsTrigger value="refunds">{t("REFUNDS")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="m-0" value="transactions">
          <ProjectionCard
            data={transactions.state}
            empty={t("NO_TRANSACTIONS")}
            label={t("TRANSACTIONS")}
            render={(data) => (
              <TransactionTable items={data.items} visibleColumns={visibleColumns} />
            )}
          />
        </TabsContent>
        <TabsContent className="m-0" value="invoices">
          <ProjectionCard
            data={invoices.state}
            empty={t("NO_INVOICES")}
            label={t("INVOICES")}
            render={(data) => <InvoiceTable items={data.items} visibleColumns={visibleColumns} />}
          />
        </TabsContent>
        <TabsContent className="m-0" value="refunds">
          <ProjectionCard
            data={refunds.state}
            empty={t("NO_REFUNDS")}
            label={t("REFUNDS")}
            render={(data) => <RefundTable items={data.items} visibleColumns={visibleColumns} />}
          />
        </TabsContent>
      </Tabs>
      <ProjectionPagination
        onNext={() => setPage((current) => current + 1)}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        page={page}
        total={projectionTotal(activeTab, transactions.state, invoices.state, refunds.state)}
      />
    </div>
  );
}

function ProjectionPagination(
  props: Readonly<{
    page: number;
    pageSize?: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const pages = Math.max(1, Math.ceil(props.total / (props.pageSize ?? 25)));
  return (
    <div className="flex items-center justify-between border-t px-3 pt-3 text-sm text-muted-foreground">
      <span>{t("PAGE_OF", { page: props.page, pages, total: props.total })}</span>
      <div className="flex gap-2">
        <Button disabled={props.page <= 1} onClick={props.onPrevious} size="sm" variant="outline">
          {t("PREVIOUS")}
        </Button>
        <Button disabled={props.page >= pages} onClick={props.onNext} size="sm" variant="outline">
          {t("NEXT")}
        </Button>
      </div>
    </div>
  );
}

function projectionTotal(
  activeTab: string,
  transactions: QueryState<Awaited<ReturnType<typeof listCommerceTransactions>>>,
  invoices: QueryState<Awaited<ReturnType<typeof listCommerceInvoices>>>,
  refunds: QueryState<Awaited<ReturnType<typeof listCommerceRefunds>>>,
): number {
  const state =
    activeTab === "transactions" ? transactions : activeTab === "invoices" ? invoices : refunds;
  return state.status === "ready" ? state.data.total : 0;
}

function ProjectionCard<T>(
  props: Readonly<{
    data: QueryState<T>;
    empty: string;
    label: string;
    render: (data: T) => ReactNode;
  }>,
) {
  return (
    <section className="space-y-3 p-4">
      <h3 className="text-base font-semibold">{props.label}</h3>
      {props.data.status === "ready" ? props.render(props.data.data) : props.empty}
    </section>
  );
}

type QueryState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

function TransactionTable(
  props: Readonly<{
    items: PlatformTransactionListOut["items"];
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const [refundTransaction, setRefundTransaction] = useState<
    PlatformTransactionListOut["items"][number] | null
  >(null);
  const shown = (id: string) => props.visibleColumns.includes(id);
  const items = props.items;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {shown("reference") ? <TableHead>{t("REFERENCE")}</TableHead> : null}
            {shown("provider") ? <TableHead>{t("PROVIDER")}</TableHead> : null}
            {shown("status") ? <TableHead>{t("STATUS")}</TableHead> : null}
            {shown("amount") ? <TableHead>{t("AMOUNT")}</TableHead> : null}
            {shown("occurred") ? <TableHead>{t("OCCURRED_AT")}</TableHead> : null}
            {shown("actions") ? <TableHead>{t("ACTION")}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                {t("NO_TRANSACTIONS")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.transactionId}>
                {shown("reference") ? (
                  <TableCell>
                    <div>{item.kind}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {item.transactionId}
                    </div>
                  </TableCell>
                ) : null}
                {shown("provider") ? (
                  <TableCell>
                    {item.provider} · {item.providerMode}
                  </TableCell>
                ) : null}
                {shown("status") ? (
                  <TableCell>
                    <Badge variant={item.status === "failed" ? "destructive" : "outline"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                ) : null}
                {shown("amount") ? (
                  <TableCell>
                    {item.amountMicros} {item.currency}
                  </TableCell>
                ) : null}
                {shown("occurred") ? (
                  <TableCell>{new Date(item.occurredAt).toLocaleString()}</TableCell>
                ) : null}
                {shown("actions") ? (
                  <TableCell>
                    {item.kind === "top_up" && item.status === "succeeded" ? (
                      <Button
                        onClick={() => setRefundTransaction(item)}
                        size="sm"
                        variant="outline"
                      >
                        {t("REQUEST_REFUND")}
                      </Button>
                    ) : (
                      t("NOT_APPLICABLE")
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {refundTransaction ? (
        <RefundDialog
          onOpenChange={(open) => !open && setRefundTransaction(null)}
          open
          transaction={refundTransaction}
        />
      ) : null}
    </>
  );
}

function InvoiceTable(
  props: Readonly<{
    items: PlatformInvoiceListOut["items"];
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const shown = (id: string) => props.visibleColumns.includes(id);
  const items = props.items;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {shown("reference") ? <TableHead>{t("REFERENCE")}</TableHead> : null}
          {shown("provider") ? <TableHead>{t("PROVIDER")}</TableHead> : null}
          {shown("status") ? <TableHead>{t("STATUS")}</TableHead> : null}
          {shown("amount") ? <TableHead>{t("AMOUNT")}</TableHead> : null}
          {shown("issued") ? <TableHead>{t("ISSUED_AT")}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell className="text-muted-foreground" colSpan={5}>
              {t("NO_INVOICES")}
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.invoiceId}>
              {shown("reference") ? (
                <TableCell>
                  <div className="font-mono text-xs">{item.invoiceId}</div>
                  <div className="text-xs text-muted-foreground">{item.externalInvoiceId}</div>
                </TableCell>
              ) : null}
              {shown("provider") ? (
                <TableCell>
                  {item.provider} · {item.providerMode}
                </TableCell>
              ) : null}
              {shown("status") ? (
                <TableCell>
                  <Badge variant="outline">{item.status}</Badge>
                </TableCell>
              ) : null}
              {shown("amount") ? (
                <TableCell>
                  {item.amountPaidMicros}/{item.amountDueMicros} {item.currency}
                </TableCell>
              ) : null}
              {shown("issued") ? (
                <TableCell>{new Date(item.issuedAt).toLocaleString()}</TableCell>
              ) : null}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function RefundTable(
  props: Readonly<{
    items: PlatformRefundListOut["items"];
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const shown = (id: string) => props.visibleColumns.includes(id);
  const items = props.items;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {shown("reference") ? <TableHead>{t("REFERENCE")}</TableHead> : null}
          {shown("status") ? <TableHead>{t("STATUS")}</TableHead> : null}
          {shown("amount") ? <TableHead>{t("AMOUNT")}</TableHead> : null}
          {shown("reason") ? <TableHead>{t("REASON")}</TableHead> : null}
          {shown("completed") ? <TableHead>{t("COMPLETED_AT")}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell className="text-muted-foreground" colSpan={5}>
              {t("NO_REFUNDS")}
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.refundId}>
              {shown("reference") ? (
                <TableCell>
                  <div className="font-mono text-xs">{item.refundId}</div>
                  <div className="text-xs text-muted-foreground">{item.transactionId}</div>
                </TableCell>
              ) : null}
              {shown("status") ? (
                <TableCell>
                  <Badge variant={item.status === "failed" ? "destructive" : "outline"}>
                    {item.status}
                  </Badge>
                </TableCell>
              ) : null}
              {shown("amount") ? <TableCell>{item.amountMicros}</TableCell> : null}
              {shown("reason") ? <TableCell>{item.reason}</TableCell> : null}
              {shown("completed") ? (
                <TableCell>
                  {item.completedAt
                    ? new Date(item.completedAt).toLocaleString()
                    : t("NOT_APPLICABLE")}
                </TableCell>
              ) : null}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function RefundDialog(
  props: Readonly<{
    open: boolean;
    transaction: PlatformTransactionListOut["items"][number];
    onOpenChange: (open: boolean) => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return setError(t("REFUND_REASON_REQUIRED"));
    setPending(true);
    setError(null);
    try {
      await requestCommerceTopUpRefund(
        props.transaction.transactionId,
        { reason: reason.trim() },
        crypto.randomUUID(),
      );
      props.onOpenChange(false);
      setReason("");
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingDialog
      description={t("REFUND_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="refund-form" type="submit">
            {pending ? t("SAVING") : t("REQUEST_REFUND")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("REQUEST_REFUND")}
    >
      <form id="refund-form" onSubmit={submit}>
        <label className="grid gap-2 text-sm" htmlFor="refund-reason">
          <span>{t("REASON")}</span>
          <Input
            id="refund-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("REFUND_REASON_PLACEHOLDER")}
            value={reason}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </form>
    </SettingDialog>
  );
}

function PaymentEvents(
  props: Readonly<{
    data: ProviderEventListOut;
    onReconciled: () => void;
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const shown = (id: string) => props.visibleColumns.includes(id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("PAYMENT_EVIDENCE")}</CardTitle>
        <CardDescription>{t("PAYMENT_EVIDENCE_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {shown("provider") ? <TableHead>{t("PROVIDER")}</TableHead> : null}
              {shown("event") ? <TableHead>{t("EVENT")}</TableHead> : null}
              {shown("status") ? <TableHead>{t("STATUS")}</TableHead> : null}
              {shown("attempts") ? <TableHead>{t("ATTEMPTS")}</TableHead> : null}
              <TableHead>{t("ACTION")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((event) => (
              <PaymentEventRow
                event={event}
                key={event.id}
                onReconciled={props.onReconciled}
                visibleColumns={props.visibleColumns}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PaymentEventRow(
  props: Readonly<{
    event: ProviderEventListOut["items"][number];
    onReconciled: () => void;
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const shown = (id: string) => props.visibleColumns.includes(id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconcileAttempt = useRef<IdempotencyAttempt | null>(null);
  const reconcile = async () => {
    const fingerprint = JSON.stringify([props.event.id, props.event.processingAttempts]);
    const attempt =
      reconcileAttempt.current?.fingerprint === fingerprint
        ? reconcileAttempt.current
        : { fingerprint, key: crypto.randomUUID() };
    reconcileAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await reconcileCommerceProviderEvent(props.event.id, {
        expectedProcessingAttempts: props.event.processingAttempts,
        idempotencyKey: attempt.key,
      });
      if (reconcileAttempt.current === attempt) reconcileAttempt.current = null;
      props.onReconciled();
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <TableRow>
      {shown("provider") ? <TableCell>{props.event.provider}</TableCell> : null}
      {shown("event") ? (
        <TableCell>
          <p>{props.event.eventType}</p>
          <p className="font-mono text-xs text-muted-foreground">{props.event.providerEventId}</p>
        </TableCell>
      ) : null}
      {shown("status") ? (
        <TableCell>
          <Badge variant={props.event.status === "failed" ? "destructive" : "outline"}>
            {props.event.status}
          </Badge>
        </TableCell>
      ) : null}
      {shown("attempts") ? <TableCell>{props.event.processingAttempts}</TableCell> : null}
      <TableCell className="space-y-2">
        {props.event.status === "failed" ? (
          <Button disabled={pending} onClick={() => void reconcile()} size="sm" variant="outline">
            {pending ? t("RECONCILING") : t("RECONCILE")}
          </Button>
        ) : (
          t("NOT_APPLICABLE")
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </TableCell>
    </TableRow>
  );
}
