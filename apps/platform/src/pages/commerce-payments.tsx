import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderEventListOut } from "@arclayer/platform-openapi";

import {
  listCommerceProviderEvents,
  reconcileCommerceProviderEvent,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

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
  const reconcile = async () => {
    setPending(true);
    try {
      await reconcileCommerceProviderEvent(props.event.id, {
        expectedProcessingAttempts: props.event.processingAttempts,
        idempotencyKey: crypto.randomUUID(),
      });
      props.onReconciled();
    } finally {
      setPending(false);
    }
  };
  return (
    <TableRow>
      <TableCell>{props.event.provider}</TableCell>
      <TableCell>
        <p>{props.event.eventType}</p>
        <p className="font-mono text-caption text-label-secondary">{props.event.providerEventId}</p>
      </TableCell>
      <TableCell>
        <Badge variant={props.event.status === "failed" ? "destructive" : "outline"}>
          {props.event.status}
        </Badge>
      </TableCell>
      <TableCell>{props.event.processingAttempts}</TableCell>
      <TableCell>
        {props.event.status === "failed" ? (
          <Button disabled={pending} onClick={() => void reconcile()} size="sm" variant="outline">
            {pending ? t("RECONCILING") : t("RECONCILE")}
          </Button>
        ) : (
          t("NOT_APPLICABLE")
        )}
      </TableCell>
    </TableRow>
  );
}
