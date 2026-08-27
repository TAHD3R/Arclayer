import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  NotificationCampaignDetailOut,
  NotificationCampaignSummaryOut,
  PageDataNotificationCampaignSummaryOut,
} from "@arclayer/platform-openapi";

import {
  archiveCampaign,
  cancelCampaign,
  getCampaign,
  listCampaigns,
  retryCampaignFailures,
} from "@/communications/communications-api";
import { CampaignDraftDialog } from "@/communications/campaign-draft-dialog";
import { CampaignPublishDialog } from "@/communications/campaign-publish-dialog";
import {
  type IdempotencyAttempt,
  MessagesPage,
  MessagesState,
} from "@/communications/messages-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CommunicationsCampaignsPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listCampaigns({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCampaign, setEditorCampaign] = useState<NotificationCampaignDetailOut>();
  const [publishTarget, setPublishTarget] = useState<NotificationCampaignSummaryOut>();
  const editorRequest = useRef(0);
  const campaignRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());
  const run = async (id: string, work: () => Promise<unknown>) => {
    setPending(id);
    setNotice(null);
    try {
      await work();
      setNotice(t("OPERATION_ACCEPTED"));
      retry();
    } catch {
      setNotice(t("OPERATION_FAILED"));
    } finally {
      setPending(null);
    }
  };
  const retryFailedCampaign = async (campaignId: string) => {
    const attempt = campaignRetryAttempts.current.get(campaignId) ?? {
      fingerprint: campaignId,
      key: crypto.randomUUID(),
    };
    campaignRetryAttempts.current.set(campaignId, attempt);
    await retryCampaignFailures(campaignId, attempt.key);
    if (campaignRetryAttempts.current.get(campaignId) === attempt)
      campaignRetryAttempts.current.delete(campaignId);
  };
  const openEditor = async (campaignId?: string) => {
    const requestId = ++editorRequest.current;
    setNotice(null);
    if (!campaignId) {
      setPending((current) => (current?.endsWith(":edit") ? null : current));
      setEditorCampaign(undefined);
      setEditorOpen(true);
      return;
    }
    setPending(`${campaignId}:edit`);
    try {
      const campaign = await getCampaign(campaignId);
      if (editorRequest.current !== requestId) return;
      setEditorCampaign(campaign);
      setEditorOpen(true);
    } catch {
      if (editorRequest.current === requestId) setNotice(t("OPERATION_FAILED"));
    } finally {
      if (editorRequest.current === requestId) setPending(null);
    }
  };
  return (
    <MessagesPage title={t("CAMPAIGNS_TITLE")} description={t("CAMPAIGNS_DESCRIPTION")}>
      <div className="flex justify-end">
        <Button onClick={() => void openEditor()}>{t("CREATE_DRAFT")}</Button>
      </div>
      <MessagesState
        empty={(data: PageDataNotificationCampaignSummaryOut) => !data.items?.length}
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
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("AUDIENCE")}</TableHead>
                    <TableHead>{t("DELIVERY_SUMMARY")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.state === "partially_failed" ? "destructive" : "outline"}
                        >
                          {t(`CAMPAIGN_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.audienceEstimate ?? t("NOT_ESTIMATED")}</TableCell>
                      <TableCell>
                        {item.metrics.delivered}/{item.metrics.recipients} ·{" "}
                        {t("FAILED_COUNT", { count: item.metrics.failed })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {item.state === "draft" ? (
                            <Button
                              loading={pending === `${item.id}:edit`}
                              onClick={() => void openEditor(item.id)}
                              size="sm"
                              variant="outline"
                            >
                              {t("EDIT")}
                            </Button>
                          ) : null}
                          {item.state === "draft" ? (
                            <Button onClick={() => setPublishTarget(item)} size="sm">
                              {t("REVIEW_AND_SEND")}
                            </Button>
                          ) : null}
                          {item.state === "scheduled" || item.state === "dispatching" ? (
                            <Button
                              loading={pending === `${item.id}:cancel`}
                              onClick={() =>
                                void run(`${item.id}:cancel`, () =>
                                  cancelCampaign(item.id, { expectedRevision: item.revision }),
                                )
                              }
                              size="sm"
                              variant="outline"
                            >
                              {t("CANCEL")}
                            </Button>
                          ) : null}
                          {item.state === "partially_failed" ? (
                            <Button
                              loading={pending === `${item.id}:retry`}
                              onClick={() =>
                                void run(`${item.id}:retry`, () => retryFailedCampaign(item.id))
                              }
                              size="sm"
                              variant="outline"
                            >
                              {t("RETRY_FAILED")}
                            </Button>
                          ) : null}
                          {item.state === "completed" || item.state === "cancelled" ? (
                            <Button
                              loading={pending === `${item.id}:archive`}
                              onClick={() =>
                                void run(`${item.id}:archive`, () =>
                                  archiveCampaign(item.id, { expectedRevision: item.revision }),
                                )
                              }
                              size="sm"
                              variant="outline"
                            >
                              {t("ARCHIVE")}
                            </Button>
                          ) : null}
                          <Link
                            className="text-sm underline"
                            search={{ campaignId: item.id }}
                            to="/messages/deliveries"
                          >
                            {t("VIEW_DELIVERIES")}
                          </Link>
                        </div>
                      </TableCell>
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
      {editorOpen ? (
        <CampaignDraftDialog
          campaign={editorCampaign}
          key={editorCampaign?.id ?? "new-campaign"}
          onCompleted={(messageKey) => {
            setNotice(t(messageKey));
            retry();
          }}
          onOpenChange={setEditorOpen}
          open={editorOpen}
        />
      ) : null}
      {publishTarget ? (
        <CampaignPublishDialog
          campaign={publishTarget}
          onCompleted={(messageKey) => {
            setNotice(t(messageKey));
            retry();
          }}
          onOpenChange={(open) => !open && setPublishTarget(undefined)}
          open
        />
      ) : null}
    </MessagesPage>
  );
}
