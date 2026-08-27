import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataNotificationDeliveryDirectoryOut,
  PageDataNotificationDeliveryOut,
} from "@arclayer/platform-openapi";

import {
  listCampaignDeliveries,
  listDeliveryDirectory,
  retryCampaignFailures,
} from "@/communications/communications-api";
import {
  type IdempotencyAttempt,
  MessagesPage,
  MessagesState,
} from "@/communications/messages-page-state";
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

export function CommunicationsDeliveriesPage({ campaignId }: Readonly<{ campaignId?: string }>) {
  return campaignId ? <CampaignDeliveries campaignId={campaignId} /> : <DeliveryDirectory />;
}

function DeliveryDirectory() {
  const { t } = useTranslation("communications");
  const load = useCallback(
    () => listDeliveryDirectory({ ordering: "-updated_at", page: 1, size: 50 }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <MessagesPage title={t("DELIVERIES_TITLE")} description={t("DELIVERIES_DESCRIPTION")}>
      <MessagesState
        empty={(data: PageDataNotificationDeliveryDirectoryOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NAME")}</TableHead>
                    <TableHead>{t("RECIPIENT")}</TableHead>
                    <TableHead>{t("CHANNEL")}</TableHead>
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("ATTEMPTS")}</TableHead>
                    <TableHead>{t("FAILURE")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          search={{ campaignId: item.campaign.id }}
                          to="/messages/deliveries"
                        >
                          {item.campaign.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {item.recipient.displayName ?? item.recipient.username ?? item.recipient.id}
                      </TableCell>
                      <TableCell>{item.channel}</TableCell>
                      <TableCell>
                        <Badge variant={item.state === "failed" ? "destructive" : "outline"}>
                          {t(`DELIVERY_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.attemptCount}</TableCell>
                      <TableCell>{item.failureMessage ?? t("NONE")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </MessagesState>
    </MessagesPage>
  );
}

function CampaignDeliveries({ campaignId }: Readonly<{ campaignId: string }>) {
  const { t } = useTranslation("communications");
  const load = useCallback(
    () => listCampaignDeliveries(campaignId, { page: 1, size: 50 }),
    [campaignId],
  );
  const { state, retry } = useMonitoringQuery(load, [campaignId]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const campaignDeliveryRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());
  const retryFailed = async () => {
    const attempt = campaignDeliveryRetryAttempts.current.get(campaignId) ?? {
      fingerprint: campaignId,
      key: crypto.randomUUID(),
    };
    campaignDeliveryRetryAttempts.current.set(campaignId, attempt);
    setPending(true);
    setNotice(null);
    try {
      await retryCampaignFailures(campaignId, attempt.key);
      if (campaignDeliveryRetryAttempts.current.get(campaignId) === attempt)
        campaignDeliveryRetryAttempts.current.delete(campaignId);
      setNotice(t("OPERATION_ACCEPTED"));
      retry();
    } catch {
      setNotice(t("OPERATION_FAILED"));
    } finally {
      setPending(false);
    }
  };
  return (
    <MessagesPage title={t("DELIVERIES_TITLE")} description={t("DELIVERIES_DESCRIPTION")}>
      <MessagesState
        empty={(data: PageDataNotificationDeliveryOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("CAMPAIGN_DELIVERIES")}</CardTitle>
              <CardDescription>{campaignId}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              <Button loading={pending} onClick={() => void retryFailed()} variant="outline">
                {t("RETRY_FAILED")}
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("CHANNEL")}</TableHead>
                    <TableHead>{t("RECIPIENT")}</TableHead>
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("ATTEMPTS")}</TableHead>
                    <TableHead>{t("FAILURE")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.channel}</TableCell>
                      <TableCell>{item.recipientUserId}</TableCell>
                      <TableCell>
                        <Badge variant={item.state === "failed" ? "destructive" : "outline"}>
                          {t(`DELIVERY_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.attemptCount}</TableCell>
                      <TableCell>{item.failureMessage ?? t("NONE")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </MessagesState>
      {notice ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </MessagesPage>
  );
}
