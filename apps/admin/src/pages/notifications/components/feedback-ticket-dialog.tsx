import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getMyFeedbackDetail } from "@/api/feedback";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { FeedbackPriority, FeedbackStatus } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Spinner } from "@arclayer/ui/spinner";

const STATUS_KEYS: Readonly<Record<FeedbackStatus, string>> = {
  new: "FEEDBACK_TICKET_STATUS_NEW",
  triaged: "FEEDBACK_TICKET_STATUS_TRIAGED",
  in_progress: "FEEDBACK_TICKET_STATUS_IN_PROGRESS",
  waiting_for_customer: "FEEDBACK_TICKET_STATUS_WAITING_FOR_CUSTOMER",
  resolved: "FEEDBACK_TICKET_STATUS_RESOLVED",
  closed: "FEEDBACK_TICKET_STATUS_CLOSED",
};

const PRIORITY_KEYS: Readonly<Record<FeedbackPriority, string>> = {
  low: "FEEDBACK_TICKET_PRIORITY_LOW",
  normal: "FEEDBACK_TICKET_PRIORITY_NORMAL",
  high: "FEEDBACK_TICKET_PRIORITY_HIGH",
  urgent: "FEEDBACK_TICKET_PRIORITY_URGENT",
};

export function FeedbackTicketDialog(props: { ticketId: string | null; onClose: () => void }) {
  const { t } = useTranslation(["feedback", "common"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const detailQuery = useQuery({
    queryKey: ["feedback", "mine", "detail", props.ticketId],
    queryFn: () => getMyFeedbackDetail(props.ticketId!),
    enabled: props.ticketId !== null,
    retry: false,
    meta: { silent: true },
  });
  const detail = detailQuery.data;

  return (
    <Dialog open={props.ticketId !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[min(48rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("feedback:FEEDBACK_TICKET_DETAIL_TITLE")}</DialogTitle>
          <DialogDescription>{t("feedback:FEEDBACK_TICKET_DETAIL_DESCRIPTION")}</DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div
            className="flex min-h-48 items-center justify-center gap-2 text-body text-label-secondary"
            role="status"
          >
            <Spinner className="size-4" />
            {t("common:LOADING")}
          </div>
        ) : detailQuery.isError || !detail ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{t("feedback:FEEDBACK_TICKET_LOAD_FAILED_TITLE")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("feedback:FEEDBACK_TICKET_LOAD_FAILED_DESCRIPTION")}</span>
              <Button type="button" variant="outline" onClick={() => void detailQuery.refetch()}>
                {t("common:RETRY")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{t(`feedback:${STATUS_KEYS[detail.status]}`)}</Badge>
              <Badge variant="outline">{t(`feedback:${PRIORITY_KEYS[detail.priority]}`)}</Badge>
              <span className="text-footnote text-label-secondary">
                {t("feedback:FEEDBACK_TICKET_LAST_ACTIVITY", {
                  date: dateTime.formatDateTime(detail.lastActivityAt),
                })}
              </span>
            </div>

            <FeedbackMessage
              author={t("feedback:FEEDBACK_TICKET_AUTHOR_YOU")}
              body={detail.message}
              createdAt={detail.createdAt}
              formatDateTime={dateTime.formatDateTime}
            />

            {detail.messages.map((message) => (
              <FeedbackMessage
                key={message.id}
                author={
                  message.author.displayName?.trim() ||
                  message.author.username.trim() ||
                  t("feedback:FEEDBACK_TICKET_AUTHOR_SUPPORT")
                }
                body={message.body}
                createdAt={message.createdAt}
                formatDateTime={dateTime.formatDateTime}
              />
            ))}

            {detail.messages.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-body text-label-secondary">
                {t("feedback:FEEDBACK_TICKET_NO_REPLIES")}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackMessage(props: {
  author: string;
  body: string;
  createdAt: string;
  formatDateTime: (value: string | null | undefined) => string;
}) {
  return (
    <article className="space-y-2 rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-headline font-semibold text-label-primary">{props.author}</h3>
        <time className="text-footnote text-label-secondary" dateTime={props.createdAt}>
          {props.formatDateTime(props.createdAt)}
        </time>
      </header>
      <p className="whitespace-pre-wrap break-words text-body text-label-primary">{props.body}</p>
    </article>
  );
}
