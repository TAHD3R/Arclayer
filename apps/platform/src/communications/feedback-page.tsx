import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FeedbackTicketDetailOut,
  PageDataFeedbackTicketListItemOut,
} from "@arclayer/platform-openapi";

import {
  addFeedbackMessage,
  getFeedback,
  listFeedback,
  retryFeedbackReplyDelivery,
  updateFeedback,
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_for_customer"
  | "resolved"
  | "closed";
type FeedbackPriority = "low" | "normal" | "high" | "urgent";

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
