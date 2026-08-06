import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformCommerceSubscriptionListOut } from "@arclayer/platform-openapi";

import { listCommerceSubscriptions } from "@/commerce/commerce-api";
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

export function CommerceSubscriptionsPage() {
  const { t } = useTranslation("commerce");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(() => listCommerceSubscriptions({ page: 1, pageSize: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("SUBSCRIPTIONS_DESCRIPTION")} title={t("SUBSCRIPTIONS_TITLE")}>
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => {
          const selected = data.items.find((item) => item.subscriptionId === selectedId) ?? null;
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <SubscriptionTable data={data} onSelect={setSelectedId} />
              <SubscriptionDetail subscription={selected} />
            </div>
          );
        }}
      </CommerceQueryState>
    </CommercePage>
  );
}

function SubscriptionTable(
  props: Readonly<{
    data: PlatformCommerceSubscriptionListOut;
    onSelect: (subscriptionId: string) => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("WORKSPACE")}</TableHead>
              <TableHead>{t("PLAN")}</TableHead>
              <TableHead>{t("STATUS")}</TableHead>
              <TableHead>{t("PROVIDER")}</TableHead>
              <TableHead>{t("PERIOD_END")}</TableHead>
              <TableHead>{t("ACCESS_STATE")}</TableHead>
              <TableHead>{t("ACTION")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((subscription) => (
              <TableRow key={subscription.subscriptionId}>
                <TableCell className="font-mono text-xs">{subscription.workspaceId}</TableCell>
                <TableCell>
                  {subscription.planCode} · {t("SEQUENCE", { sequence: subscription.planRevision })}
                </TableCell>
                <TableCell>
                  <Badge variant={subscription.status === "past_due" ? "destructive" : "outline"}>
                    {t(`STATUS_${subscription.status.toUpperCase()}`)}
                  </Badge>
                </TableCell>
                <TableCell>{subscription.billingProvider}</TableCell>
                <TableCell>
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {subscription.commercialAccessState
                    ? t(`ACCESS_STATE_${subscription.commercialAccessState.toUpperCase()}`)
                    : t("NOT_APPLICABLE")}
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => props.onSelect(subscription.subscriptionId)}
                    size="sm"
                    variant="outline"
                  >
                    {t("VIEW_DETAILS")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SubscriptionDetail(
  props: Readonly<{
    subscription: PlatformCommerceSubscriptionListOut["items"][number] | null;
  }>,
) {
  const { t } = useTranslation("commerce");
  if (!props.subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("SUBSCRIPTION_DETAIL_TITLE")}</CardTitle>
          <CardDescription>{t("SUBSCRIPTION_DETAIL_EMPTY")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const subscription = props.subscription;
  const accessState = subscription.commercialAccessState
    ? t(`ACCESS_STATE_${subscription.commercialAccessState.toUpperCase()}`)
    : t("NOT_APPLICABLE");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("SUBSCRIPTION_DETAIL_TITLE")}</CardTitle>
        <CardDescription>{subscription.workspaceId}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <DetailRow label={t("SUBSCRIPTION_REFERENCE")} value={subscription.subscriptionId} />
        <DetailRow label={t("REVISION")} value={subscription.planRevisionId} />
        <DetailRow label={t("BILLING_CYCLE")} value={subscription.billingCycle} />
        <DetailRow label={t("ACCESS_STATE")} value={accessState} />
        <DetailRow
          label={t("RECOVERY_DEADLINE")}
          value={
            subscription.recoveryDeadlineAt
              ? new Date(subscription.recoveryDeadlineAt).toLocaleString()
              : t("NOT_APPLICABLE")
          }
        />
        <DetailRow
          label={t("CANCELS_AT_PERIOD_END")}
          value={subscription.cancelAtPeriodEnd ? t("YES") : t("NO")}
        />
      </CardContent>
    </Card>
  );
}

function DetailRow(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1 border-b pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="break-all">{props.value}</span>
    </div>
  );
}
