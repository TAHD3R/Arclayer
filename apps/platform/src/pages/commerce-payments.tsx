import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderEventListOut } from "@arclayer/platform-openapi";

import {
  listCommerceProviderEvents,
  reconcileCommerceProviderEvent,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    </CommercePage>
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
