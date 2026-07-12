import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  approveSystemSubscriptionChangeRequest,
  listSystemSubscriptionChangeRequests,
  rejectSystemSubscriptionChangeRequest,
  type SubscriptionChangeRequest,
} from "@/api/commerce";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { SystemSettingItem } from "@/pages/system/components/system-setting-item";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Field, FieldDescription, FieldLabel } from "@arclayer/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import { Textarea } from "@arclayer/ui/textarea";

type ReviewAction = "approve" | "reject";
type ReviewTarget = { action: ReviewAction; request: SubscriptionChangeRequest };
type RequestStatusFilter = SubscriptionChangeRequest["status"] | "all";

const PAGE_SIZE = 10;
const REQUEST_STATUSES: RequestStatusFilter[] = [
  "pending",
  "approved",
  "rejected",
  "canceled",
  "all",
];

function requestStatusVariant(status: SubscriptionChangeRequest["status"]) {
  if (status === "approved") return "secondary" as const;
  if (status === "rejected" || status === "canceled") return "outline" as const;
  return "default" as const;
}

export function SubscriptionChangeRequestReview() {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RequestStatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const lastTargetRef = useRef<ReviewTarget | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["system", "commerce", "subscription-change-requests", status, page],
    queryFn: ({ signal }) =>
      listSystemSubscriptionChangeRequests(
        { status: status === "all" ? undefined : status, page, size: PAGE_SIZE },
        signal,
      ),
    retry: false,
  });

  const reviewMutation = useMutation({
    mutationFn: async (review: ReviewTarget) => {
      if (review.action === "approve") {
        return approveSystemSubscriptionChangeRequest(review.request.id, reviewNote);
      }
      return rejectSystemSubscriptionChangeRequest(review.request.id, reviewNote);
    },
    onSuccess: async (_, review) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["system", "commerce", "subscription-change-requests"],
        }),
        queryClient.invalidateQueries({ queryKey: ["commerce", "workspace"] }),
      ]);
      notifySuccessText(
        t(
          review.action === "approve"
            ? "commerce:SETTINGS_REQUEST_APPROVED"
            : "commerce:SETTINGS_REQUEST_REJECTED",
        ),
      );
      setTarget(null);
    },
    onError: notifyError,
  });

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const items = requestsQuery.data?.items ?? [];
  const pages = requestsQuery.data?.pages ?? 1;
  const displayTarget = target ?? lastTargetRef.current;
  const rejectionNoteMissing = displayTarget?.action === "reject" && !reviewNote.trim();

  const openReview = (action: ReviewAction, request: SubscriptionChangeRequest) => {
    setReviewNote("");
    const nextTarget = { action, request };
    lastTargetRef.current = nextTarget;
    setTarget(nextTarget);
  };

  return (
    <>
      <SystemSettingItem
        id="commerce-subscription-change-requests"
        title={t("commerce:SETTINGS_REQUESTS_TITLE")}
        description={t("commerce:SETTINGS_REQUESTS_DESCRIPTION")}
        headerAction={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as RequestStatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="w-44"
              aria-label={t("commerce:SETTINGS_REQUEST_STATUS_FILTER")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {REQUEST_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`commerce:SETTINGS_REQUEST_STATUS_${value.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      >
        <ContentGuard
          loading={requestsQuery.isLoading}
          error={requestsQuery.error}
          empty={!requestsQuery.isLoading && !requestsQuery.error && items.length === 0}
          emptyTitle={t("commerce:SETTINGS_REQUESTS_EMPTY_TITLE")}
          emptyDescription={t("commerce:SETTINGS_REQUESTS_EMPTY_DESCRIPTION")}
          onRetry={() => void requestsQuery.refetch()}
          variant="compact"
          mediaVariant="none"
          wrapperSpacing="flush"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("commerce:SETTINGS_REQUEST_WORKSPACE")}</TableHead>
                <TableHead>{t("commerce:SETTINGS_REQUEST_PLAN")}</TableHead>
                <TableHead>{t("commerce:BILLING_INTERVAL")}</TableHead>
                <TableHead>{t("commerce:SETTINGS_REQUEST_CREATED")}</TableHead>
                <TableHead>{t("commerce:SETTINGS_REQUEST_STATUS")}</TableHead>
                <TableHead className="text-right">
                  {t("commerce:SETTINGS_REQUEST_ACTIONS")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="max-w-48 truncate font-mono">
                    {request.workspaceId}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="block">{request.planName}</span>
                    <span className="text-footnote font-normal text-label-secondary">
                      {request.planCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    {t(`commerce:BILLING_${request.billingInterval.toUpperCase()}`)}
                  </TableCell>
                  <TableCell>{formatter.format(new Date(request.createdAt))}</TableCell>
                  <TableCell>
                    <Badge variant={requestStatusVariant(request.status)}>
                      {t(`commerce:SETTINGS_REQUEST_STATUS_${request.status.toUpperCase()}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openReview("reject", request)}
                        >
                          <X data-icon="inline-start" />
                          {t("commerce:SETTINGS_REQUEST_REJECT")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openReview("approve", request)}
                        >
                          <Check data-icon="inline-start" />
                          {t("commerce:SETTINGS_REQUEST_APPROVE")}
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-right text-label-secondary">
                        {request.reviewNote || "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <span className="text-footnote text-label-secondary">
                {t("commerce:SETTINGS_REQUEST_PAGE", { page, pages })}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={t("common:PREVIOUS")}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={t("common:NEXT")}
                disabled={page >= pages}
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </ContentGuard>
      </SystemSettingItem>

      <SettingDialog
        open={Boolean(target)}
        preventInitialFocus={false}
        closeButtonLabel={t("common:CLOSE")}
        onOpenChange={(open) => {
          if (!open && !reviewMutation.isPending) setTarget(null);
        }}
        title={t(
          displayTarget?.action === "reject"
            ? "commerce:SETTINGS_REQUEST_REJECT_TITLE"
            : "commerce:SETTINGS_REQUEST_APPROVE_TITLE",
        )}
        description={t(
          displayTarget?.action === "reject"
            ? "commerce:SETTINGS_REQUEST_REJECT_DESCRIPTION"
            : "commerce:SETTINGS_REQUEST_REVIEW_DESCRIPTION",
          { plan: displayTarget?.request.planName ?? "" },
        )}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={reviewMutation.isPending}
              onClick={() => setTarget(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant={displayTarget?.action === "reject" ? "destructive" : "default"}
              loading={reviewMutation.isPending}
              disabled={!target || rejectionNoteMissing}
              onClick={() => {
                if (target) reviewMutation.mutate(target);
              }}
            >
              {t(
                displayTarget?.action === "reject"
                  ? "commerce:SETTINGS_REQUEST_REJECT"
                  : "commerce:SETTINGS_REQUEST_APPROVE",
              )}
            </Button>
          </>
        }
      >
        <Field data-invalid={rejectionNoteMissing}>
          <FieldLabel htmlFor="commerce-request-review-note">
            {t("commerce:SETTINGS_REQUEST_REVIEW_NOTE")}
          </FieldLabel>
          <Textarea
            id="commerce-request-review-note"
            rows={4}
            maxLength={1000}
            value={reviewNote}
            aria-invalid={rejectionNoteMissing}
            onChange={(event) => setReviewNote(event.target.value)}
          />
          <FieldDescription>
            {t(
              displayTarget?.action === "reject"
                ? "commerce:SETTINGS_REQUEST_REVIEW_NOTE_REQUIRED"
                : "commerce:SETTINGS_REQUEST_REVIEW_NOTE_OPTIONAL",
            )}
          </FieldDescription>
        </Field>
      </SettingDialog>
    </>
  );
}
