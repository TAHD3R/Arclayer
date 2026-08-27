import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderEventListOut } from "@arclayer/platform-openapi";

import { reconcileCommerceProviderEvent } from "@/commerce/commerce-api";
import type { IdempotencyAttempt } from "@/commerce/commerce-ui";
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

export function PaymentEvents(
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
