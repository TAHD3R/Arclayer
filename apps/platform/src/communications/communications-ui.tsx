import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  FeedbackTicketDetailOut,
  MailProviderInfo,
  MailServiceOut,
  PageDataFeedbackTicketListItemOut,
  PageDataMailTemplateGroupOut,
  PageDataNotificationCampaignSummaryOut,
  PageDataNotificationDeliveryOut,
} from "@arclayer/platform-openapi";

import {
  addFeedbackMessage,
  archiveCampaign,
  cancelCampaign,
  createCampaign,
  disableMailService,
  estimateCampaignAudience,
  getFeedback,
  getMailService,
  listCampaignDeliveries,
  listCampaigns,
  listFeedback,
  listMailProviders,
  listTemplateHistory,
  listTemplates,
  previewCampaign,
  publishCampaign,
  recoverMailService,
  restoreTemplate,
  retryCampaignFailures,
  retryFeedbackReplyDelivery,
  switchMailProvider,
  testMailService,
  testSendTemplate,
  updateFeedback,
} from "@/communications/communications-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import { Textarea } from "@arclayer/ui/textarea";

type LoadState<T> = Readonly<{ status: string; data?: T }>;
type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_for_customer"
  | "resolved"
  | "closed";
type FeedbackPriority = "low" | "normal" | "high" | "urgent";

function MessagesPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("FEEDBACK_DETAIL")}</CardTitle>
        <CardDescription>{ticket.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-footnote">
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
          <label className="space-y-1 text-footnote">
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
          <label className="space-y-1 text-footnote">
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
            <span className="text-footnote text-label-secondary">
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
                <p className="text-footnote text-label-secondary">
                  {t(`MESSAGE_KIND_${message.kind.toUpperCase()}`)} ·{" "}
                  {new Date(message.createdAt).toLocaleString()}
                </p>
                {message.deliveryState ? (
                  <Badge variant={message.deliveryState === "failed" ? "destructive" : "outline"}>
                    {t(`DELIVERY_STATE_${message.deliveryState.toUpperCase()}`)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-body">{message.body}</p>
              {message.deliveryIsRetryable ? (
                <Button
                  loading={pending}
                  onClick={() =>
                    void mutate(() =>
                      retryFeedbackReplyDelivery(ticket.id, message.id, crypto.randomUUID()),
                    )
                  }
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
          <p aria-live="polite" className="text-footnote text-label-secondary">
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
  const [name, setName] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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
  return (
    <MessagesPage title={t("CAMPAIGNS_TITLE")} description={t("CAMPAIGNS_DESCRIPTION")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("CREATE_CAMPAIGN")}</CardTitle>
          <CardDescription>{t("CREATE_CAMPAIGN_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            aria-label={t("CAMPAIGN_NAME")}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("CAMPAIGN_NAME")}
            value={name}
          />
          <Button
            disabled={!name.trim()}
            loading={pending === "create"}
            onClick={() =>
              void run("create", async () => {
                await createCampaign({ name, audience: { kind: "all_active_users" } });
                setName("");
              })
            }
          >
            {t("CREATE_DRAFT")}
          </Button>
        </CardContent>
      </Card>
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
                          <Button
                            loading={pending === `${item.id}:estimate`}
                            onClick={() =>
                              void run(`${item.id}:estimate`, () =>
                                estimateCampaignAudience(item.id),
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            {t("VALIDATE")}
                          </Button>
                          <Button
                            loading={pending === `${item.id}:preview`}
                            onClick={() =>
                              void run(`${item.id}:preview`, () => previewCampaign(item.id))
                            }
                            size="sm"
                            variant="outline"
                          >
                            {t("PREVIEW")}
                          </Button>
                          {item.state === "draft" || item.state === "scheduled" ? (
                            <Button
                              loading={pending === `${item.id}:publish`}
                              onClick={() =>
                                void run(`${item.id}:publish`, () =>
                                  publishCampaign(item.id, {
                                    expectedRevision: item.revision,
                                    scheduleAt: scheduleAt
                                      ? new Date(scheduleAt).toISOString()
                                      : null,
                                  }),
                                )
                              }
                              size="sm"
                            >
                              {scheduleAt ? t("SCHEDULE") : t("SEND_NOW")}
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
                                void run(`${item.id}:retry`, () =>
                                  retryCampaignFailures(item.id, crypto.randomUUID()),
                                )
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
                          <a
                            className="text-footnote underline"
                            href={`/messages/deliveries?campaignId=${encodeURIComponent(item.id)}`}
                          >
                            {t("VIEW_DELIVERIES")}
                          </a>
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
      <label className="max-w-sm space-y-1 text-footnote">
        <span>{t("SCHEDULE_AT")}</span>
        <Input
          onChange={(event) => setScheduleAt(event.target.value)}
          type="datetime-local"
          value={scheduleAt}
        />
      </label>
      {notice ? (
        <p aria-live="polite" className="text-footnote text-label-secondary">
          {notice}
        </p>
      ) : null}
    </MessagesPage>
  );
}

export function CommunicationsDeliveriesPage({ campaignId }: Readonly<{ campaignId?: string }>) {
  const { t } = useTranslation("communications");
  if (!campaignId)
    return (
      <MessagesPage title={t("DELIVERIES_TITLE")} description={t("DELIVERIES_DESCRIPTION")}>
        <Empty className="min-h-72 border bg-card">
          <EmptyHeader>
            <EmptyTitle>{t("DELIVERY_SCOPE_REQUIRED_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("DELIVERY_SCOPE_REQUIRED_DESCRIPTION")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </MessagesPage>
    );
  return <CampaignDeliveries campaignId={campaignId} />;
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
  const retryFailed = async () => {
    setPending(true);
    setNotice(null);
    try {
      await retryCampaignFailures(campaignId, crypto.randomUUID());
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
        <p aria-live="polite" className="text-footnote text-label-secondary">
          {notice}
        </p>
      ) : null}
    </MessagesPage>
  );
}

export function CommunicationsTemplatesPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listTemplates({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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
  return (
    <MessagesPage title={t("TEMPLATES_TITLE")} description={t("TEMPLATES_DESCRIPTION")}>
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
                        <p className="text-footnote text-label-secondary">{item.key}</p>
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
                            <span className="text-footnote">{locale.subjectPreview}</span>
                            <Button
                              loading={pending === `${locale.id}:test`}
                              onClick={() => {
                                const recipient = window.prompt(t("TEST_RECIPIENT_PROMPT"));
                                if (recipient)
                                  void run(`${locale.id}:test`, () =>
                                    testSendTemplate(locale.id, { recipient }),
                                  );
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              {t("TEST_SEND")}
                            </Button>
                            {locale.sourceState !== "custom" ? (
                              <Button
                                loading={pending === `${locale.id}:restore`}
                                onClick={() =>
                                  void run(`${locale.id}:restore`, () =>
                                    restoreTemplate(locale.id, { expectedVersion: locale.version }),
                                  )
                                }
                                size="sm"
                                variant="ghost"
                              >
                                {t("RESTORE_DEFAULT")}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Button
                          loading={pending === `${item.key}:history`}
                          onClick={() =>
                            void run(`${item.key}:history`, () =>
                              listTemplateHistory(item.key, { page: 1, size: 20 }),
                            )
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
        <p aria-live="polite" className="text-footnote text-label-secondary">
          {notice}
        </p>
      ) : null}
    </MessagesPage>
  );
}

export function CommunicationsEmailPage() {
  const { t } = useTranslation("communications");
  const providersLoad = useCallback(() => listMailProviders(), []);
  const profileLoad = useCallback(() => getMailService(), []);
  const providers = useMonitoringQuery(providersLoad, []);
  const profile = useMonitoringQuery(profileLoad, []);
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (name: string, work: () => Promise<unknown>) => {
    setPending(name);
    setNotice(null);
    try {
      await work();
      setNotice(t("OPERATION_ACCEPTED"));
      providers.retry();
      profile.retry();
    } catch {
      setNotice(t("OPERATION_FAILED"));
    } finally {
      setPending(null);
    }
  };
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
              <p className="text-footnote text-label-secondary">
                {service.sender.address ?? t("SENDER_NOT_CONFIGURED")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder={t("TEST_RECIPIENT")}
                  type="email"
                  value={recipient}
                />
                <Button
                  disabled={!recipient}
                  loading={pending === "test"}
                  onClick={() =>
                    void run("test", () =>
                      testMailService({
                        expectedRevision: service.revision,
                        idempotencyKey: crypto.randomUUID(),
                        recipient,
                      }),
                    )
                  }
                  variant="outline"
                >
                  {t("TEST_SERVICE")}
                </Button>
                {service.active ? (
                  <Button
                    loading={pending === "disable"}
                    onClick={() =>
                      void run("disable", () =>
                        disableMailService({
                          expectedRevision: service.revision,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      )
                    }
                    variant="outline"
                  >
                    {t("DISABLE")}
                  </Button>
                ) : (
                  <Button
                    loading={pending === "recover"}
                    onClick={() =>
                      void run("recover", () =>
                        recoverMailService({
                          expectedRevision: service.revision,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      )
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
                  <p className="text-footnote text-label-secondary">
                    {provider.error ??
                      (provider.configured
                        ? t("PROVIDER_CONFIGURED")
                        : t("PROVIDER_NOT_CONFIGURED"))}
                  </p>
                  <Button
                    disabled={!provider.available || provider.active}
                    loading={pending === provider.providerId}
                    onClick={() =>
                      void run(provider.providerId, () => switchMailProvider(provider.providerId))
                    }
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
        <p aria-live="polite" className="text-footnote text-label-secondary">
          {notice}
        </p>
      ) : null}
    </MessagesPage>
  );
}
