import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  FeedbackTicketDetailOut,
  MailProviderInfo,
  MailServiceOut,
  MailTemplateOut,
  NotificationCampaignDetailOut,
  NotificationCampaignSummaryOut,
  PageDataNotificationDeliveryDirectoryOut,
  PageDataFeedbackTicketListItemOut,
  PageDataMailTemplateGroupOut,
  PageDataNotificationCampaignSummaryOut,
  PageDataNotificationDeliveryOut,
} from "@arclayer/platform-openapi";

import {
  addFeedbackMessage,
  archiveCampaign,
  cancelCampaign,
  getCampaign,
  getFeedback,
  getMailService,
  getTemplate,
  listCampaignDeliveries,
  listCampaigns,
  listDeliveryDirectory,
  listFeedback,
  listMailProviders,
  listTemplates,
  retryCampaignFailures,
  retryFeedbackReplyDelivery,
  updateFeedback,
} from "@/communications/communications-api";
import { CampaignDraftDialog } from "@/communications/campaign-draft-dialog";
import { CampaignPublishDialog } from "@/communications/campaign-publish-dialog";
import {
  DeleteEmailTemplateDialog,
  EmailTemplateHistoryDialog,
  EmailTemplateTestDialog,
  RestoreEmailTemplateDialog,
} from "@/communications/email-template-action-dialogs";
import { EmailTemplateEditorDialog } from "@/communications/email-template-editor-dialog";
import {
  MailCredentialDialog,
  MailServiceActionDialog,
  MailServiceProfileDialog,
  MailServiceTestDialog,
} from "@/communications/mail-service-dialogs";
import { PlatformPage } from "@/components/platform-page";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type LoadState<T> = Readonly<{ status: string; data?: T }>;
type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_for_customer"
  | "resolved"
  | "closed";
type FeedbackPriority = "low" | "normal" | "high" | "urgent";
type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

function MessagesPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <PlatformPage description={description} title={title}>
      {children}
    </PlatformPage>
  );
}

function MessagesState<T>({
  state,
  retry,
  empty,
  children,
}: Readonly<{
  state: LoadState<T>;
  retry: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}>) {
  const { t } = useTranslation("communications");
  if (state.status === "loading")
    return (
      <div className="space-y-3" aria-busy="true" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  if (!state.data || empty(state.data))
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return children(state.data);
}

function FeedbackDetail({
  ticketId,
  onChanged,
}: Readonly<{ ticketId: string; onChanged: () => void }>) {
  const load = useCallback(() => getFeedback(ticketId), [ticketId]);
  const { state, retry } = useMonitoringQuery(load, [ticketId]);
  return (
    <MessagesState empty={() => false} retry={retry} state={state}>
      {(ticket: FeedbackTicketDetailOut) => (
        <FeedbackDetailContent
          ticket={ticket}
          onChanged={() => {
            retry();
            onChanged();
          }}
        />
      )}
    </MessagesState>
  );
}

function FeedbackDetailContent({
  ticket,
  onChanged,
}: Readonly<{ ticket: FeedbackTicketDetailOut; onChanged: () => void }>) {
  const { t } = useTranslation("communications");
  const [status, setStatus] = useState<FeedbackStatus>(ticket.status);
  const [priority, setPriority] = useState<FeedbackPriority>(ticket.priority);
  const [assignee, setAssignee] = useState(ticket.assignee?.id ?? "");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"reply" | "internal_note">("reply");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const replyRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());
  const mutate = async (work: () => Promise<unknown>) => {
    setPending(true);
    setNotice(null);
    try {
      await work();
      setNotice(t("OPERATION_ACCEPTED"));
      onChanged();
    } catch {
      setNotice(t("OPERATION_FAILED"));
    } finally {
      setPending(false);
    }
  };
  const retryReply = async (messageId: string, messageBody: string) => {
    const fingerprint = JSON.stringify([ticket.id, messageId, messageBody]);
    const attempt = replyRetryAttempts.current.get(fingerprint) ?? {
      fingerprint,
      key: crypto.randomUUID(),
    };
    replyRetryAttempts.current.set(fingerprint, attempt);
    await retryFeedbackReplyDelivery(ticket.id, messageId, attempt.key);
    if (replyRetryAttempts.current.get(fingerprint) === attempt)
      replyRetryAttempts.current.delete(fingerprint);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("FEEDBACK_DETAIL")}</CardTitle>
        <CardDescription>{ticket.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>{t("STATUS")}</span>
            <select
              className="h-9 w-full rounded-md border bg-card px-2"
              onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
              value={status}
            >
              {(
                [
                  "new",
                  "triaged",
                  "in_progress",
                  "waiting_for_customer",
                  "resolved",
                  "closed",
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`FEEDBACK_STATUS_${value.toUpperCase()}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t("PRIORITY")}</span>
            <select
              className="h-9 w-full rounded-md border bg-card px-2"
              onChange={(event) => setPriority(event.target.value as FeedbackPriority)}
              value={priority}
            >
              {(["low", "normal", "high", "urgent"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`PRIORITY_${value.toUpperCase()}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t("ASSIGNEE_ID")}</span>
            <Input onChange={(event) => setAssignee(event.target.value)} value={assignee} />
          </label>
        </div>
        <Button
          loading={pending}
          onClick={() =>
            void mutate(() =>
              updateFeedback(ticket.id, {
                expectedRevision: ticket.revision,
                status,
                priority,
                assigneeUserId: assignee || null,
                clearAssignee: !assignee,
              }),
            )
          }
        >
          {t("SAVE_TRIAGE")}
        </Button>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border bg-card px-2"
              onChange={(event) => setKind(event.target.value as "reply" | "internal_note")}
              value={kind}
            >
              <option value="reply">{t("PUBLIC_REPLY")}</option>
              <option value="internal_note">{t("INTERNAL_NOTE")}</option>
            </select>
            <span className="text-sm text-muted-foreground">
              {kind === "reply" ? t("REPLY_DELIVERY_EVIDENCE") : t("INTERNAL_NOTE_PRIVATE")}
            </span>
          </div>
          <Textarea
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("MESSAGE_PLACEHOLDER")}
            value={body}
          />
          <Button
            disabled={!body.trim()}
            loading={pending}
            onClick={() =>
              void mutate(async () => {
                await addFeedbackMessage(ticket.id, {
                  kind,
                  body,
                  expectedRevision: ticket.revision,
                  clientRequestId: crypto.randomUUID(),
                });
                setBody("");
              })
            }
          >
            {t("SEND")}
          </Button>
        </div>
        <div className="space-y-2">
          {ticket.messages.map((message) => (
            <div className="rounded-md border p-3" key={message.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t(`MESSAGE_KIND_${message.kind.toUpperCase()}`)} ·{" "}
                  {new Date(message.createdAt).toLocaleString()}
                </p>
                {message.deliveryState ? (
                  <Badge variant={message.deliveryState === "failed" ? "destructive" : "outline"}>
                    {t(`DELIVERY_STATE_${message.deliveryState.toUpperCase()}`)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-base">{message.body}</p>
              {message.deliveryIsRetryable ? (
                <Button
                  loading={pending}
                  onClick={() => void mutate(() => retryReply(message.id, message.body))}
                  size="sm"
                  variant="outline"
                >
                  {t("RETRY_DELIVERY")}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {notice ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CommunicationsFeedbackPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listFeedback({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [detailId, setDetailId] = useState<string | null>(null);
  return (
    <MessagesPage title={t("FEEDBACK_TITLE")} description={t("FEEDBACK_DESCRIPTION")}>
      <MessagesState
        empty={(data: PageDataFeedbackTicketListItemOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("FEEDBACK")}</TableHead>
                    <TableHead>{t("STATUS")}</TableHead>
                    <TableHead>{t("PRIORITY")}</TableHead>
                    <TableHead>{t("REPORTER")}</TableHead>
                    <TableHead>{t("LAST_ACTIVITY")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.messagePreview}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "new" ? "destructive" : "outline"}>
                          {t(`FEEDBACK_STATUS_${item.status.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t(`PRIORITY_${item.priority.toUpperCase()}`)}</TableCell>
                      <TableCell>{item.reporter.displayName ?? item.reporter.username}</TableCell>
                      <TableCell>{new Date(item.lastActivityAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button onClick={() => setDetailId(item.id)} size="sm" variant="ghost">
                          {t("DETAILS")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </MessagesState>
      {detailId ? <FeedbackDetail key={detailId} onChanged={retry} ticketId={detailId} /> : null}
    </MessagesPage>
  );
}

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

type TemplateDialogState =
  | Readonly<{ kind: "create" }>
  | Readonly<{
      kind: "delete" | "edit" | "restore" | "test";
      template: MailTemplateOut;
    }>
  | Readonly<{ kind: "history"; templateKey: string; templateName: string }>;

export function CommunicationsTemplatesPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listTemplates({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TemplateDialogState | null>(null);
  const templateRequest = useRef(0);
  const openDialog = (nextDialog: TemplateDialogState) => {
    templateRequest.current += 1;
    setPending(null);
    setDialog(nextDialog);
  };
  const openTemplateDialog = async (
    templateId: string,
    kind: "delete" | "edit" | "restore" | "test",
  ) => {
    const requestId = ++templateRequest.current;
    const operationId = `${templateId}:${kind}`;
    setPending(operationId);
    setNotice(null);
    try {
      const template = await getTemplate(templateId);
      if (templateRequest.current !== requestId) return;
      setDialog({ kind, template });
    } catch {
      if (templateRequest.current === requestId) setNotice(t("OPERATION_FAILED"));
    } finally {
      if (templateRequest.current === requestId) setPending(null);
    }
  };
  const completed = (messageKey: string) => {
    setNotice(t(messageKey));
    retry();
  };
  return (
    <MessagesPage title={t("TEMPLATES_TITLE")} description={t("TEMPLATES_DESCRIPTION")}>
      <div className="flex justify-end">
        <Button onClick={() => openDialog({ kind: "create" })}>{t("CREATE_TEMPLATE")}</Button>
      </div>
      <MessagesState
        empty={(data: PageDataMailTemplateGroupOut) => !data.items?.length}
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
                    <TableHead>{t("CATEGORY")}</TableHead>
                    <TableHead>{t("HEALTH")}</TableHead>
                    <TableHead>{t("LOCALES")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <p>{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.key}</p>
                      </TableCell>
                      <TableCell>{t(`CATEGORY_${item.category.toUpperCase()}`)}</TableCell>
                      <TableCell>{t(`TEMPLATE_HEALTH_${item.health.toUpperCase()}`)}</TableCell>
                      <TableCell>
                        {item.locales.map((locale) => (
                          <div className="mb-1 flex flex-wrap items-center gap-2" key={locale.id}>
                            <Badge
                              variant={
                                locale.validationState === "valid" ? "secondary" : "destructive"
                              }
                            >
                              {locale.locale} · v{locale.version}
                            </Badge>
                            <span className="text-sm">{locale.subjectPreview}</span>
                            <Button
                              loading={pending === `${locale.id}:edit`}
                              onClick={() => void openTemplateDialog(locale.id, "edit")}
                              size="sm"
                              variant="ghost"
                            >
                              {t("EDIT")}
                            </Button>
                            <Button
                              loading={pending === `${locale.id}:test`}
                              onClick={() => void openTemplateDialog(locale.id, "test")}
                              size="sm"
                              variant="ghost"
                            >
                              {t("TEST_SEND")}
                            </Button>
                            {locale.sourceState === "overridden" ? (
                              <Button
                                loading={pending === `${locale.id}:restore`}
                                onClick={() => void openTemplateDialog(locale.id, "restore")}
                                size="sm"
                                variant="ghost"
                              >
                                {t("RESTORE_DEFAULT")}
                              </Button>
                            ) : null}
                            {locale.sourceState === "custom" ? (
                              <Button
                                loading={pending === `${locale.id}:delete`}
                                onClick={() => void openTemplateDialog(locale.id, "delete")}
                                size="sm"
                                variant="ghost"
                              >
                                {t("DELETE")}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() =>
                            openDialog({
                              kind: "history",
                              templateKey: item.key,
                              templateName: item.name,
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          {t("HISTORY")}
                        </Button>
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
      {dialog?.kind === "create" ? (
        <EmailTemplateEditorDialog
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EmailTemplateEditorDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "test" ? (
        <EmailTemplateTestDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteEmailTemplateDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "restore" ? (
        <RestoreEmailTemplateDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "history" ? (
        <EmailTemplateHistoryDialog
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          templateKey={dialog.templateKey}
          templateName={dialog.templateName}
        />
      ) : null}
    </MessagesPage>
  );
}

type MailDialogState =
  | Readonly<{
      kind: "credentials" | "disable" | "profile" | "recover" | "rotate" | "test";
      service: MailServiceOut;
    }>
  | Readonly<{ kind: "switch"; provider: MailProviderInfo; service: MailServiceOut }>;

function mailActionAvailable(
  service: MailServiceOut,
  action: NonNullable<MailServiceOut["permittedActions"]>[number]["action"],
): boolean {
  return (
    service.permittedActions?.some((item) => item.action === action && item.available) ?? false
  );
}

export function CommunicationsEmailPage() {
  const { t } = useTranslation("communications");
  const providersLoad = useCallback(() => listMailProviders(), []);
  const profileLoad = useCallback(() => getMailService(), []);
  const providers = useMonitoringQuery(providersLoad, []);
  const profile = useMonitoringQuery(profileLoad, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MailDialogState | null>(null);
  const completed = (messageKey: string) => {
    setNotice(t(messageKey));
    providers.retry();
    profile.retry();
  };
  const service = profile.state.status === "ready" ? profile.state.data : undefined;
  return (
    <MessagesPage title={t("EMAIL_TITLE")} description={t("EMAIL_DESCRIPTION")}>
      <MessagesState empty={() => false} retry={profile.retry} state={profile.state}>
        {(service: MailServiceOut) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("MAIL_READINESS")}</CardTitle>
              <CardDescription>
                {t(`MAIL_READINESS_${service.readiness.toUpperCase()}`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={service.active ? "secondary" : "outline"}>
                  {service.active ? t("ACTIVE") : t("INACTIVE")}
                </Badge>
                <Badge variant={service.senderVerified ? "secondary" : "outline"}>
                  {service.senderVerified ? t("SENDER_VERIFIED") : t("SENDER_UNVERIFIED")}
                </Badge>
                <Badge variant={service.reachable ? "secondary" : "destructive"}>
                  {service.reachable ? t("REACHABLE") : t("UNREACHABLE")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {service.sender.address ?? t("SENDER_NOT_CONFIGURED")}
              </p>
              <p className="text-sm text-muted-foreground">
                {service.credentialConfigured
                  ? t("CREDENTIALS_CONFIGURED")
                  : t("CREDENTIALS_NOT_CONFIGURED")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("LAST_TEST")}:{" "}
                {service.lastTestStatus
                  ? `${t(`TEST_STATUS_${service.lastTestStatus.toUpperCase()}`)} · ${
                      service.lastTestedAt
                        ? new Date(service.lastTestedAt).toLocaleString()
                        : t("LAST_TEST_NOT_RUN")
                    }`
                  : t("LAST_TEST_NOT_RUN")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!mailActionAvailable(service, "configure")}
                  onClick={() => setDialog({ kind: "profile", service })}
                  title={
                    mailActionAvailable(service, "configure") ? undefined : t("ACTION_UNAVAILABLE")
                  }
                  variant="outline"
                >
                  {t("CONFIGURE_SERVICE")}
                </Button>
                {service.credentialConfigured ? (
                  <Button
                    disabled={!mailActionAvailable(service, "rotate_credentials")}
                    onClick={() => setDialog({ kind: "rotate", service })}
                    title={
                      mailActionAvailable(service, "rotate_credentials")
                        ? undefined
                        : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("ROTATE_CREDENTIALS")}
                  </Button>
                ) : (
                  <Button
                    disabled={!mailActionAvailable(service, "configure_credentials")}
                    onClick={() => setDialog({ kind: "credentials", service })}
                    title={
                      mailActionAvailable(service, "configure_credentials")
                        ? undefined
                        : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("CONFIGURE_CREDENTIALS")}
                  </Button>
                )}
                <Button
                  disabled={!mailActionAvailable(service, "test")}
                  onClick={() => setDialog({ kind: "test", service })}
                  title={mailActionAvailable(service, "test") ? undefined : t("ACTION_UNAVAILABLE")}
                  variant="outline"
                >
                  {t("TEST_SERVICE")}
                </Button>
                {service.active ? (
                  <Button
                    disabled={!mailActionAvailable(service, "disable")}
                    onClick={() => setDialog({ kind: "disable", service })}
                    title={
                      mailActionAvailable(service, "disable") ? undefined : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("DISABLE")}
                  </Button>
                ) : (
                  <Button
                    disabled={!mailActionAvailable(service, "recover")}
                    onClick={() => setDialog({ kind: "recover", service })}
                    title={
                      mailActionAvailable(service, "recover") ? undefined : t("ACTION_UNAVAILABLE")
                    }
                  >
                    {t("RECOVER")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </MessagesState>
      <MessagesState empty={() => false} retry={providers.retry} state={providers.state}>
        {(items: MailProviderInfo[]) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((provider) => (
              <Card key={provider.providerId}>
                <CardHeader>
                  <CardTitle>{provider.label}</CardTitle>
                  <CardDescription>{provider.providerId}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant={provider.active && provider.available ? "secondary" : "outline"}>
                    {provider.active && provider.available ? t("READY") : t("NOT_READY")}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {!provider.available
                      ? t("PROVIDER_UNAVAILABLE")
                      : provider.configured
                        ? t("PROVIDER_CONFIGURED")
                        : t("PROVIDER_NOT_CONFIGURED")}
                  </p>
                  <Button
                    disabled={!service || !provider.available || provider.active}
                    onClick={() => service && setDialog({ kind: "switch", provider, service })}
                    title={!service || !provider.available ? t("ACTION_UNAVAILABLE") : undefined}
                    variant="outline"
                  >
                    {t("ACTIVATE_PROVIDER")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </MessagesState>
      {notice ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {dialog?.kind === "profile" ? (
        <MailServiceProfileDialog
          key={dialog.service.revision}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "credentials" || dialog?.kind === "rotate" ? (
        <MailCredentialDialog
          key={`${dialog.kind}:${dialog.service.revision}`}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          rotate={dialog.kind === "rotate"}
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "test" ? (
        <MailServiceTestDialog
          key={dialog.service.revision}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "disable" || dialog?.kind === "recover" ? (
        <MailServiceActionDialog
          key={`${dialog.kind}:${dialog.service.revision}`}
          kind={dialog.kind}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "switch" ? (
        <MailServiceActionDialog
          key={`${dialog.provider.providerId}:${dialog.service.revision}`}
          kind="switch"
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          provider={dialog.provider}
          service={dialog.service}
        />
      ) : null}
    </MessagesPage>
  );
}
