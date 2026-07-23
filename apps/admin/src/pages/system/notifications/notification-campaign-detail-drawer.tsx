import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Eye, MousePointerClick, Send, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  estimateNotificationCampaignAudience,
  getNotificationCampaign,
  listNotificationCampaignDeliveries,
  previewNotificationCampaign,
  type NotificationCampaignSummary,
  type NotificationDelivery,
  type NotificationPresentation,
} from "@/api/notification-campaigns";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import { useDataTable } from "@arclayer/ui/data-table";

import {
  CampaignDeliverySummary,
  CampaignPresentationTags,
  CampaignStateTag,
} from "./notification-campaign-ui";

export type CampaignDetailTab = "overview" | "preview" | "deliveries";

function deliveryStateColor(state: NotificationDelivery["state"]) {
  if (state === "delivered" || state === "sent") return "green" as const;
  if (state === "failed") return "red" as const;
  if (state === "processing") return "gold" as const;
  return "default" as const;
}

function MetricCard(props: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-caption text-label-tertiary">
        <Icon className="size-4" />
        {props.label}
      </div>
      <p className="mt-2 text-title2 font-semibold tabular-nums text-label-primary">
        {props.value}
      </p>
    </div>
  );
}

function PreviewCard(props: {
  locale: string;
  presentation: string;
  payload: Record<string, unknown>;
}) {
  const title = typeof props.payload.title === "string" ? props.payload.title : props.presentation;
  const body = typeof props.payload.body === "string" ? props.payload.body : null;
  const action =
    props.payload.action && typeof props.payload.action === "object"
      ? (props.payload.action as Record<string, unknown>)
      : props.payload.primaryAction && typeof props.payload.primaryAction === "object"
        ? (props.payload.primaryAction as Record<string, unknown>)
        : null;
  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <CampaignPresentationTags
          presentations={[props.presentation as NotificationPresentation]}
        />
        <BaseTag>{props.locale}</BaseTag>
      </div>
      <h3 className="font-semibold text-label-primary">{title}</h3>
      {body ? (
        <p className="mt-2 whitespace-pre-wrap text-footnote leading-6 text-label-secondary">
          {body}
        </p>
      ) : null}
      {action && typeof action.label === "string" ? (
        <div className="mt-3 inline-flex rounded-md border bg-muted/30 px-3 py-1.5 text-footnote font-medium">
          {action.label}
        </div>
      ) : null}
    </section>
  );
}

export function NotificationCampaignDetailDrawer(props: {
  open: boolean;
  campaign: NotificationCampaignSummary | null;
  initialTab: CampaignDetailTab;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["common", "settings"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const [tab, setTab] = useState<CampaignDetailTab>(props.initialTab);
  const campaignId = props.campaign?.id ?? null;
  useEffect(() => {
    if (props.open) setTab(props.initialTab);
  }, [props.initialTab, props.open]);
  const detailQuery = useQuery({
    queryKey: ["system", "notification-campaign", campaignId],
    queryFn: () => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return getNotificationCampaign(campaignId);
    },
    enabled: props.open && Boolean(campaignId),
  });
  const estimateQuery = useQuery({
    queryKey: ["system", "notification-campaign", campaignId, "estimate"],
    queryFn: () => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return estimateNotificationCampaignAudience(campaignId);
    },
    enabled: props.open && tab === "overview" && Boolean(campaignId),
  });
  const previewQuery = useQuery({
    queryKey: ["system", "notification-campaign", campaignId, "preview"],
    queryFn: () => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return previewNotificationCampaign(campaignId);
    },
    enabled: props.open && tab === "preview" && Boolean(campaignId),
  });
  const deliveryColumns = useMemo<ColumnDef<NotificationDelivery, unknown>[]>(
    () => [
      {
        id: "recipient",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_RECIPIENT"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_RECIPIENT"),
          kind: "primary",
        },
        cell: ({ row }) => (
          <span className="font-mono text-caption">{row.original.recipientUserId}</span>
        ),
        size: 220,
      },
      {
        id: "channel",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_CHANNEL"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_CHANNEL"),
          kind: "meta",
        },
        cell: ({ row }) => <CampaignPresentationTags presentations={[row.original.presentation]} />,
        size: 150,
      },
      {
        id: "state",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_STATE"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_STATE"),
          kind: "meta",
        },
        cell: ({ row }) => (
          <BaseTag color={deliveryStateColor(row.original.state)}>
            {t(
              `settings:SETTINGS_SYSTEM_NOTIFICATIONS_DELIVERY_STATE_${row.original.state.toUpperCase()}`,
            )}
          </BaseTag>
        ),
        size: 130,
      },
      {
        id: "attempts",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_ATTEMPTS"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_ATTEMPTS"),
          kind: "meta",
        },
        cell: ({ row }) => <span className="tabular-nums">{row.original.attemptCount}</span>,
        size: 90,
      },
      {
        id: "updated",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_UPDATED"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_UPDATED"),
          kind: "meta",
        },
        cell: ({ row }) => (
          <span className="truncate">{dateTime.formatDateTime(row.original.updatedAt)}</span>
        ),
        size: 180,
      },
      {
        id: "failure",
        header: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_FAILURE"),
        meta: {
          title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_COLUMN_FAILURE"),
          kind: "meta",
        },
        cell: ({ row }) => (
          <span
            className="block max-w-64 truncate text-footnote text-destructive"
            title={row.original.failureMessage ?? undefined}
          >
            {row.original.failureMessage ?? "—"}
          </span>
        ),
        size: 260,
      },
    ],
    [dateTime, t],
  );
  const deliveriesTable = useDataTable<NotificationDelivery>({
    tableId: "system-notification-campaign-deliveries",
    columns: deliveryColumns,
    initialState: { pageSize: 20 },
    fetcher: (params) => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return listNotificationCampaignDeliveries(campaignId, {
        page: params.page,
        size: params.size,
      });
    },
    queryOptions: {
      enabled: props.open && tab === "deliveries" && Boolean(campaignId),
      retry: false,
    },
  });
  const campaign = detailQuery.data ?? props.campaign;

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-6xl">
        <DrawerHeader className="max-w-none gap-1 rounded-none px-5 py-4 pr-14 text-left">
          <DrawerTitle>
            {campaign?.name ?? t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DETAIL_TITLE")}
          </DrawerTitle>
          <DrawerDescription>
            {campaign?.internalDescription ??
              t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DETAIL_DESC")}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="min-h-0 max-w-none flex-1 overflow-hidden p-0">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as CampaignDetailTab)}
            className="flex h-full min-h-0 flex-col"
          >
            <TabsList className="mx-5 mt-3 w-fit">
              <TabsTrigger value="overview">
                {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DETAIL_OVERVIEW")}
              </TabsTrigger>
              <TabsTrigger value="preview">
                {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DETAIL_PREVIEW")}
              </TabsTrigger>
              <TabsTrigger value="deliveries">
                {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DETAIL_DELIVERIES")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
              <ContentGuard
                loading={detailQuery.isLoading}
                error={detailQuery.error}
                onRetry={() => void detailQuery.refetch()}
                loadingVariant="form"
              >
                {campaign ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CampaignStateTag state={campaign.state} />
                      <CampaignPresentationTags presentations={campaign.presentations} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <MetricCard
                        icon={Users}
                        label={t(
                          "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_METRIC_RECIPIENTS",
                        )}
                        value={
                          estimateQuery.data?.estimatedRecipients ?? campaign.metrics.recipients
                        }
                      />
                      <MetricCard
                        icon={Send}
                        label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_METRIC_SENT")}
                        value={campaign.metrics.sent + campaign.metrics.delivered}
                      />
                      <MetricCard
                        icon={AlertTriangle}
                        label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_METRIC_FAILED")}
                        value={campaign.metrics.failed}
                      />
                      <MetricCard
                        icon={Eye}
                        label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_METRIC_READ")}
                        value={campaign.metrics.read}
                      />
                      <MetricCard
                        icon={MousePointerClick}
                        label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_METRIC_CLICKED")}
                        value={campaign.metrics.clicked}
                      />
                    </div>
                    <section className="rounded-lg border p-4">
                      <h3 className="mb-3 font-semibold">
                        {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_DELIVERY")}
                      </h3>
                      <CampaignDeliverySummary metrics={campaign.metrics} />
                    </section>
                    <dl className="grid gap-x-8 gap-y-4 rounded-lg border p-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-caption text-label-tertiary">
                          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_TIMEZONE")}
                        </dt>
                        <dd className="mt-1 text-footnote">{campaign.timezone}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-label-tertiary">
                          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_SCHEDULE")}
                        </dt>
                        <dd className="mt-1 text-footnote">
                          {campaign.scheduleAt
                            ? dateTime.formatDateTime(campaign.scheduleAt)
                            : t(
                                "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_SCHEDULE_IMMEDIATE",
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-label-tertiary">
                          {t(
                            "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_DISPLAY_WINDOW",
                          )}
                        </dt>
                        <dd className="mt-1 text-footnote">
                          {campaign.displayStartAt
                            ? dateTime.formatDateTime(campaign.displayStartAt)
                            : "—"}{" "}
                          –{" "}
                          {campaign.displayEndAt
                            ? dateTime.formatDateTime(campaign.displayEndAt)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-label-tertiary">
                          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_UPDATED")}
                        </dt>
                        <dd className="mt-1 text-footnote">
                          {dateTime.formatDateTime(campaign.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </ContentGuard>
            </TabsContent>
            <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
              <ContentGuard
                loading={previewQuery.isLoading}
                error={previewQuery.error}
                onRetry={() => void previewQuery.refetch()}
                loadingVariant="form"
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {previewQuery.data?.variants.flatMap((variant) =>
                    Object.entries(variant.presentations).map(([presentation, payload]) => (
                      <PreviewCard
                        key={`${variant.locale}:${presentation}`}
                        locale={variant.locale}
                        presentation={presentation}
                        payload={payload}
                      />
                    )),
                  )}
                </div>
              </ContentGuard>
            </TabsContent>
            <TabsContent
              value="deliveries"
              className="min-h-0 flex-1 overflow-hidden px-5 pb-5 pt-4"
            >
              <AdminDataTableSection
                table={deliveriesTable.table}
                emptyText={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_EMPTY")}
                emptyTitle={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_EMPTY")}
                emptyDescription={t(
                  "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_EMPTY_DESC",
                )}
                loading={deliveriesTable.isLoading}
                error={deliveriesTable.error}
                onRetry={() => void deliveriesTable.refetch()}
                infiniteScroll={deliveriesTable.infiniteScroll}
                t={(key, options) => t(key, options)}
                rowHeight="short"
                wrapHeaders
              />
            </TabsContent>
          </Tabs>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
