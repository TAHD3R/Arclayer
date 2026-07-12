import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageSquareText, StickyNote } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addSystemFeedbackMessage,
  getSystemFeedback,
  updateSystemFeedback,
  type FeedbackMessageKind,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/api/feedback";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_CONTEXT_LABELS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "@/pages/system/feedback/model";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@arclayer/ui/field";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { Separator } from "@arclayer/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";
import { Textarea } from "@arclayer/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

import { FeedbackUserPicker } from "./feedback-user-picker";

export function FeedbackDetailSheet(props: {
  feedbackId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["common", "platform"]);
  const queryClient = useQueryClient();
  const [messageKind, setMessageKind] = useState<FeedbackMessageKind>("reply");
  const [body, setBody] = useState("");
  const [bodyInvalid, setBodyInvalid] = useState(false);
  const detailQuery = useQuery({
    queryKey: ["system", "feedback", "detail", props.feedbackId],
    queryFn: () => getSystemFeedback(props.feedbackId!),
    enabled: Boolean(props.feedbackId),
    retry: false,
  });

  const refreshFeedback = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["system", "feedback", "list"] }),
      queryClient.invalidateQueries({
        queryKey: ["system", "feedback", "detail", props.feedbackId],
      }),
    ]);
  };

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateSystemFeedback>[1]) =>
      updateSystemFeedback(props.feedbackId!, payload),
    onSuccess: async () => {
      await refreshFeedback();
      notifySuccessText(t("platform:FEEDBACK_UPDATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const messageMutation = useMutation({
    mutationFn: () =>
      addSystemFeedbackMessage(props.feedbackId!, { kind: messageKind, body: body.trim() }),
    onSuccess: async () => {
      await refreshFeedback();
      setBody("");
      setBodyInvalid(false);
      notifySuccessText(t("platform:FEEDBACK_SEND_SUCCESS"));
    },
    onError: notifyError,
  });

  const detail = detailQuery.data;
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const sendMessage = () => {
    if (!body.trim()) {
      setBodyInvalid(true);
      return;
    }
    messageMutation.mutate();
  };

  return (
    <Sheet
      open={Boolean(props.feedbackId)}
      onOpenChange={(open) => {
        if (!open) {
          setBody("");
          setBodyInvalid(false);
        }
        props.onOpenChange(open);
      }}
    >
      <SheetContent
        className="w-full sm:w-160"
        aria-describedby="feedback-detail-description"
        closeButtonLabel={t("common:CLOSE")}
      >
        <SheetHeader>
          <SheetTitle>{t("platform:FEEDBACK_DETAIL_TITLE")}</SheetTitle>
          <SheetDescription id="feedback-detail-description">
            {detail?.message.slice(0, 140) ?? t("platform:FEEDBACK_DETAIL_LOADING")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 pb-8">
            <ContentGuard
              loading={detailQuery.isLoading}
              error={detailQuery.error}
              onRetry={() => void detailQuery.refetch()}
              variant="compact"
              mediaVariant="none"
            >
              {detail ? (
                <div className="flex flex-col gap-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="feedback-detail-status">
                        {t("platform:FEEDBACK_COLUMN_STATUS")}
                      </FieldLabel>
                      <Select
                        value={detail.status}
                        disabled={updateMutation.isPending}
                        onValueChange={(status) =>
                          updateMutation.mutate({ status: status as FeedbackStatus })
                        }
                      >
                        <SelectTrigger id="feedback-detail-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {FEEDBACK_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {t(`platform:${FEEDBACK_STATUS_LABELS[status]}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feedback-detail-priority">
                        {t("platform:FEEDBACK_COLUMN_PRIORITY")}
                      </FieldLabel>
                      <Select
                        value={detail.priority}
                        disabled={updateMutation.isPending}
                        onValueChange={(priority) =>
                          updateMutation.mutate({ priority: priority as FeedbackPriority })
                        }
                      >
                        <SelectTrigger id="feedback-detail-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {FEEDBACK_PRIORITIES.map((priority) => (
                              <SelectItem key={priority} value={priority}>
                                {t(`platform:${FEEDBACK_PRIORITY_LABELS[priority]}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="feedback-detail-assignee">
                        {t("platform:FEEDBACK_COLUMN_ASSIGNEE")}
                      </FieldLabel>
                      <FeedbackUserPicker
                        id="feedback-detail-assignee"
                        value={detail.assignee}
                        placeholder={t("platform:ACTION_ASSIGN")}
                        clearLabel={t("platform:FEEDBACK_ASSIGNEE_UNASSIGNED")}
                        disabled={updateMutation.isPending}
                        onChange={(assignee) =>
                          updateMutation.mutate(
                            assignee ? { assigneeUserId: assignee.id } : { clearAssignee: true },
                          )
                        }
                      />
                    </Field>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-headline">
                        {t("platform:FEEDBACK_DETAIL_ORIGINAL")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <p className="whitespace-pre-wrap text-body text-label-primary">
                        {detail.message}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {t(`platform:${FEEDBACK_CATEGORY_LABELS[detail.category]}`)}
                        </Badge>
                        <Badge variant="outline">
                          {t(`platform:${FEEDBACK_SOURCE_LABELS[detail.source]}`)}
                        </Badge>
                        <Badge variant="outline">
                          {t(`platform:${FEEDBACK_CONTEXT_LABELS[detail.contextType]}`)}
                        </Badge>
                        {detail.rating ? (
                          <Badge variant="secondary">{t(`platform:RATING_${detail.rating}`)}</Badge>
                        ) : null}
                      </div>
                      <div className="text-footnote text-label-secondary">
                        {detail.reporter.displayName || detail.reporter.username}
                        {" · "}
                        {formatter.format(new Date(detail.createdAt))}
                      </div>
                      {detail.contextUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-footnote text-link hover:underline"
                          href={detail.contextUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("platform:FEEDBACK_DETAIL_OPEN_CONTEXT")}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>

                  <section aria-labelledby="feedback-activity-title">
                    <h3 id="feedback-activity-title" className="text-headline font-semibold">
                      {t("platform:FEEDBACK_DETAIL_ACTIVITY")}
                    </h3>
                    <div className="mt-3 flex flex-col gap-3">
                      {detail.messages.length === 0 ? (
                        <Alert>
                          <AlertDescription>
                            {t("platform:FEEDBACK_MESSAGE_EMPTY")}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        detail.messages.map((message) => (
                          <Card key={message.id}>
                            <CardContent className="p-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-footnote font-medium">
                                  {message.kind === "internal_note" ? (
                                    <StickyNote className="size-4" />
                                  ) : (
                                    <MessageSquareText className="size-4" />
                                  )}
                                  {message.author.displayName || message.author.username}
                                </div>
                                <Badge
                                  variant={
                                    message.kind === "internal_note" ? "outline" : "secondary"
                                  }
                                >
                                  {t(
                                    message.kind === "internal_note"
                                      ? "platform:FEEDBACK_INTERNAL_NOTE"
                                      : "platform:FEEDBACK_REPLY",
                                  )}
                                </Badge>
                              </div>
                              <p className="whitespace-pre-wrap text-footnote">{message.body}</p>
                              <div className="mt-2 text-caption text-label-secondary">
                                {formatter.format(new Date(message.createdAt))}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </section>

                  <Separator />

                  <Field data-invalid={bodyInvalid || undefined}>
                    <FieldLabel htmlFor="feedback-detail-message">
                      {t("platform:FEEDBACK_DETAIL_ADD_MESSAGE")}
                    </FieldLabel>
                    <ToggleGroup
                      type="single"
                      value={messageKind}
                      variant="outline"
                      aria-label={t("platform:FEEDBACK_DETAIL_MESSAGE_KIND")}
                      onValueChange={(value) => {
                        if (value) setMessageKind(value as FeedbackMessageKind);
                      }}
                    >
                      <ToggleGroupItem value="reply">
                        {t("platform:FEEDBACK_REPLY")}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="internal_note">
                        {t("platform:FEEDBACK_INTERNAL_NOTE")}
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <FieldDescription>
                      {t(
                        messageKind === "reply"
                          ? "platform:FEEDBACK_REPLY_HINT"
                          : "platform:FEEDBACK_INTERNAL_NOTE_HINT",
                      )}
                    </FieldDescription>
                    <Textarea
                      id="feedback-detail-message"
                      value={body}
                      rows={5}
                      maxLength={10_000}
                      aria-invalid={bodyInvalid || undefined}
                      placeholder={t("platform:FEEDBACK_MESSAGE_PLACEHOLDER")}
                      onChange={(event) => {
                        setBody(event.target.value);
                        if (event.target.value.trim()) setBodyInvalid(false);
                      }}
                    />
                    {bodyInvalid ? (
                      <FieldError>{t("platform:FEEDBACK_VALIDATION_REQUIRED")}</FieldError>
                    ) : null}
                    <Button
                      className="self-end"
                      loading={messageMutation.isPending}
                      disabled={messageMutation.isPending}
                      onClick={sendMessage}
                    >
                      {t("platform:ACTION_SEND")}
                    </Button>
                  </Field>
                </div>
              ) : null}
            </ContentGuard>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
