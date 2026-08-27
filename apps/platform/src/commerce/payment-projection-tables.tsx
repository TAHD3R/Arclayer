import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformInvoiceListOut,
  PlatformRefundListOut,
  PlatformTransactionListOut,
} from "@arclayer/platform-openapi";

import { requestCommerceTopUpRefund } from "@/commerce/commerce-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function TransactionTable(
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

export function InvoiceTable(
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

export function RefundTable(
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
