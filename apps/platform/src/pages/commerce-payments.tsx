import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderEventListOut } from "@arclayer/platform-openapi";

import {
  listCommerceProviderEvents,
  listCommerceInvoices,
  listCommerceRefunds,
  listCommerceTransactions,
  recordCommercePaymentCorrection,
  reconcileCommerceProviderEvent,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

export function CommercePaymentsPage() {
  const { t } = useTranslation("commerce");
  const load = useCallback(() => listCommerceProviderEvents({ page: 1, pageSize: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("PAYMENTS_DESCRIPTION")} title={t("PAYMENTS_TITLE")}>
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => <PaymentEvents data={data} onReconciled={retry} />}
      </CommerceQueryState>
      <PaymentProjections />
      <PaymentCorrectionPanel />
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

function PaymentCorrectionPanel() {
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
    <Card>
      <CardHeader>
        <CardTitle>{t("PAYMENT_CORRECTION_TITLE")}</CardTitle>
        <CardDescription>{t("PAYMENT_CORRECTION_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
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
                value={form.reason}
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="payment-correction-evidence">
              <span>{t("EVIDENCE_REFERENCE")}</span>
              <Input
                id="payment-correction-evidence"
                onChange={(event) => update("evidenceReference", event.target.value)}
                value={form.evidenceReference}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending} type="submit">
              {pending ? t("PAYMENT_CORRECTION_SAVING") : t("PAYMENT_CORRECTION_SUBMIT")}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PaymentProjections() {
  const { t } = useTranslation("commerce");
  const transactions = useMonitoringQuery(
    () => listCommerceTransactions({ page: 1, pageSize: 50 }),
    [],
  );
  const invoices = useMonitoringQuery(() => listCommerceInvoices({ page: 1, pageSize: 50 }), []);
  const refunds = useMonitoringQuery(() => listCommerceRefunds({ page: 1, pageSize: 50 }), []);
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <ProjectionCard
        data={transactions.state}
        empty={t("NO_TRANSACTIONS")}
        label={t("TRANSACTIONS")}
        render={(data) => (
          <ProjectionRows
            items={data.items}
            render={(item) =>
              `${item.kind} · ${item.status} · ${item.amountMicros} ${item.currency}`
            }
          />
        )}
      />
      <ProjectionCard
        data={invoices.state}
        empty={t("NO_INVOICES")}
        label={t("INVOICES")}
        render={(data) => (
          <ProjectionRows
            items={data.items}
            render={(item) =>
              `${item.status} · ${item.amountPaidMicros}/${item.amountDueMicros} ${item.currency}`
            }
          />
        )}
      />
      <ProjectionCard
        data={refunds.state}
        empty={t("NO_REFUNDS")}
        label={t("REFUNDS")}
        render={(data) => (
          <ProjectionRows
            items={data.items}
            render={(item) => `${item.status} · ${item.amountMicros} ${item.transactionId}`}
          />
        )}
      />
    </div>
  );
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
    <Card>
      <CardHeader>
        <CardTitle>{props.label}</CardTitle>
      </CardHeader>
      <CardContent>
        {props.data.status === "ready" ? props.render(props.data.data) : props.empty}
      </CardContent>
    </Card>
  );
}

type QueryState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

function ProjectionRows<T>(props: Readonly<{ items: readonly T[]; render: (item: T) => string }>) {
  return props.items.length === 0 ? (
    <p className="text-sm text-muted-foreground">—</p>
  ) : (
    <ul className="space-y-2 text-sm">
      {props.items.slice(0, 5).map((item, index) => (
        <li key={index}>{props.render(item)}</li>
      ))}
    </ul>
  );
}

function PaymentEvents(props: Readonly<{ data: ProviderEventListOut; onReconciled: () => void }>) {
  const { t } = useTranslation("commerce");
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
              <TableHead>{t("PROVIDER")}</TableHead>
              <TableHead>{t("EVENT")}</TableHead>
              <TableHead>{t("STATUS")}</TableHead>
              <TableHead>{t("ATTEMPTS")}</TableHead>
              <TableHead>{t("ACTION")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((event) => (
              <PaymentEventRow event={event} key={event.id} onReconciled={props.onReconciled} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PaymentEventRow(
  props: Readonly<{ event: ProviderEventListOut["items"][number]; onReconciled: () => void }>,
) {
  const { t } = useTranslation("commerce");
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
      <TableCell>{props.event.provider}</TableCell>
      <TableCell>
        <p>{props.event.eventType}</p>
        <p className="font-mono text-xs text-muted-foreground">{props.event.providerEventId}</p>
      </TableCell>
      <TableCell>
        <Badge variant={props.event.status === "failed" ? "destructive" : "outline"}>
          {props.event.status}
        </Badge>
      </TableCell>
      <TableCell>{props.event.processingAttempts}</TableCell>
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
