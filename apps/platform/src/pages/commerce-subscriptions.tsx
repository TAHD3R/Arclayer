import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformCommerceSubscriptionListOut } from "@arclayer/platform-openapi";

import { listCommerceSubscriptions } from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent } from "@arclayer/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

export function CommerceSubscriptionsPage() {
  const { t } = useTranslation("commerce");
  const load = useCallback(() => listCommerceSubscriptions({ page: 1, pageSize: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("SUBSCRIPTIONS_DESCRIPTION")} title={t("SUBSCRIPTIONS_TITLE")}>
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => <SubscriptionTable data={data} />}
      </CommerceQueryState>
    </CommercePage>
  );
}

function SubscriptionTable(props: Readonly<{ data: PlatformCommerceSubscriptionListOut }>) {
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((subscription) => (
              <TableRow key={subscription.subscriptionId}>
                <TableCell className="font-mono text-caption">{subscription.workspaceId}</TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
