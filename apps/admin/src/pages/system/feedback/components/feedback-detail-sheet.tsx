import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  getSystemFeedback,
  updateSystemFeedback,
  type FeedbackPage,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/api/feedback";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { FeedbackUserIdentity } from "@/pages/system/feedback/components/feedback-user-identity";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_CONTEXT_LABELS,
  FEEDBACK_INTENT_LABELS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "@/pages/system/feedback/model";
import { Card, CardContent, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Field, FieldLabel } from "@arclayer/ui/field";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";

import { FeedbackUserPicker } from "./feedback-user-picker";

function FeedbackMetadataItem(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd className="mt-1 min-w-0 break-all text-footnote text-label-primary">{props.children}</dd>
    </div>
  );
}

export function FeedbackDetailSheet(props: {
  feedbackId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["common", "platform"]);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["system", "feedback", "detail", props.feedbackId],
    queryFn: () => getSystemFeedback(props.feedbackId!),
    enabled: Boolean(props.feedbackId),
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateSystemFeedback>[1]) =>
      updateSystemFeedback(props.feedbackId!, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(["system", "feedback", "detail", updated.id], updated);
      queryClient.setQueriesData<FeedbackPage>(
        { queryKey: ["dataTable", "system-feedback-center"] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === updated.id
                    ? {
                        ...item,
                        assignee: updated.assignee,
                        priority: updated.priority,
                        status: updated.status,
                        lastActivityAt: updated.lastActivityAt,
                        resolvedAt: updated.resolvedAt,
                        closedAt: updated.closedAt,
                        updatedAt: updated.updatedAt,
                      }
                    : item,
                ),
              }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: ["dataTable", "system-feedback-center"],
        refetchType: "none",
      });
      notifySuccessText(t("platform:FEEDBACK_UPDATE_SUCCESS"));
    },
    onError: notifyError,
  });
  const detail = detailQuery.data;
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Sheet open={Boolean(props.feedbackId)} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full sm:w-152"
        aria-describedby="feedback-detail-description"
        closeButtonLabel={t("common:CLOSE")}
      >
        <SheetHeader>
          <SheetTitle>{t("platform:FEEDBACK_DETAIL_TITLE")}</SheetTitle>
          <SheetDescription id="feedback-detail-description">
            {t("platform:FEEDBACK_DETAIL_DESCRIPTION")}
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
                <div className="flex flex-col gap-5">
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
                    <CardHeader className="pb-3">
                      <CardTitle className="text-headline">
                        {t("platform:FEEDBACK_DETAIL_ORIGINAL")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <FeedbackUserIdentity
                        user={detail.reporter}
                        emptyLabel={t("platform:FEEDBACK_REPORTER_UNKNOWN")}
                      />
                      <p className="whitespace-pre-wrap text-body text-label-primary">
                        {detail.message}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {detail.intent ? (
                          <BaseTag>
                            {t(`platform:${FEEDBACK_INTENT_LABELS[detail.intent]}`)}
                          </BaseTag>
                        ) : (
                          <BaseTag>{t("platform:FEEDBACK_LEGACY_MARKER")}</BaseTag>
                        )}
                        {detail.legacyCategory ? (
                          <BaseTag>
                            {t("platform:FEEDBACK_LEGACY_CATEGORY", {
                              category: t(
                                `platform:${FEEDBACK_CATEGORY_LABELS[detail.legacyCategory]}`,
                              ),
                            })}
                          </BaseTag>
                        ) : null}
                        <BaseTag>{t(`platform:${FEEDBACK_SOURCE_LABELS[detail.source]}`)}</BaseTag>
                        <BaseTag>
                          {t(`platform:${FEEDBACK_CONTEXT_LABELS[detail.contextType]}`)}
                        </BaseTag>
                      </div>
                      <p className="text-caption text-label-tertiary">
                        {formatter.format(new Date(detail.createdAt))}
                      </p>
                    </CardContent>
                  </Card>

                  <details className="group rounded-xl border border-border bg-card">
                    <summary className="cursor-pointer list-none px-5 py-4 text-headline font-semibold text-label-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {t("platform:FEEDBACK_DETAIL_TECHNICAL_CONTEXT")}
                    </summary>
                    <div className="border-t border-border px-5 py-4">
                      <dl className="grid gap-4 sm:grid-cols-2">
                        <FeedbackMetadataItem label={t("platform:FEEDBACK_CLIENT_REQUEST_ID")}>
                          <code>{detail.clientRequestId}</code>
                        </FeedbackMetadataItem>
                        <FeedbackMetadataItem label={t("platform:FEEDBACK_COLUMN_CONTEXT")}>
                          {t(`platform:${FEEDBACK_CONTEXT_LABELS[detail.contextType]}`)}
                        </FeedbackMetadataItem>
                        <FeedbackMetadataItem label={t("platform:FEEDBACK_WORKSPACE_ID")}>
                          {detail.workspaceId ?? "-"}
                        </FeedbackMetadataItem>
                        <FeedbackMetadataItem label={t("platform:FEEDBACK_PROJECT_ID")}>
                          {detail.projectId ?? "-"}
                        </FeedbackMetadataItem>
                      </dl>
                      {detail.contextUrl ? (
                        <a
                          className="mt-5 inline-flex items-center gap-1 text-footnote text-link hover:underline"
                          href={detail.contextUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("platform:FEEDBACK_DETAIL_OPEN_CONTEXT")}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : null}
                      <pre className="mt-5 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-caption text-label-secondary">
                        {JSON.stringify(detail.context, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              ) : null}
            </ContentGuard>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
