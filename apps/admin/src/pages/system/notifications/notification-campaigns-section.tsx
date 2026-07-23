import { useMemo, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Archive, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  archiveNotificationCampaign,
  cancelNotificationCampaign,
  createNotificationCampaign,
  getNotificationCampaign,
  listNotificationCampaigns,
  publishNotificationCampaign,
  retryNotificationCampaignFailures,
  type NotificationCampaignDetail,
  type NotificationCampaignOrdering,
  type NotificationCampaignSummary,
} from "@/api/notification-campaigns";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { useDataTable } from "@arclayer/ui/data-table";
import type { PageData } from "@arclayer/openapi/admin-types";

import { SystemSettingItem } from "../components/system-setting-item";
import {
  DEFAULT_CAMPAIGN_ORDERING,
  NotificationCampaignFilterPopover,
  type NotificationCampaignFilters,
} from "./notification-campaign-filter-popover";
import {
  NotificationCampaignDetailDrawer,
  type CampaignDetailTab,
} from "./notification-campaign-detail-drawer";
import { NotificationCampaignEditorDialog } from "./notification-campaign-editor-dialog";
import { createNotificationCampaignColumns } from "./notification-campaign-table-columns";

const CAMPAIGN_TABLE_ID = "system-notification-campaigns";
const ARCHIVEABLE_STATES = new Set(["completed", "partially_failed", "cancelled"]);

type CampaignAction =
  | { kind: "publish"; campaign: NotificationCampaignSummary; scheduleAt: string | null }
  | { kind: "cancel"; campaign: NotificationCampaignSummary }
  | { kind: "retry"; campaign: NotificationCampaignSummary }
  | { kind: "archive"; campaign: NotificationCampaignSummary }
  | { kind: "duplicate"; campaign: NotificationCampaignSummary };

function patchCampaignCaches(queryClient: QueryClient, campaign: NotificationCampaignSummary) {
  queryClient.setQueriesData<PageData<NotificationCampaignSummary>>(
    { queryKey: ["dataTable", CAMPAIGN_TABLE_ID] },
    (current) => {
      if (!current) return current;
      const exists = current.items.some((item) => item.id === campaign.id);
      return {
        ...current,
        total: exists ? current.total : current.total + 1,
        items: exists
          ? current.items.map((item) => (item.id === campaign.id ? campaign : item))
          : [campaign, ...current.items],
      };
    },
  );
}

function copyCampaignPayload(campaign: NotificationCampaignDetail) {
  return {
    name: `${campaign.name} · Copy`,
    internalDescription: campaign.internalDescription,
    audience: campaign.audience,
    timezone: campaign.timezone,
    displayStartAt: campaign.displayStartAt,
    displayEndAt: campaign.displayEndAt,
    priority: campaign.priority,
    conflictPolicy: campaign.conflictPolicy,
    channels: campaign.channels,
    presentations: campaign.presentations,
    fallbackLocale: campaign.fallbackLocale,
    variants: campaign.variants.map((variant) => ({
      locale: variant.locale,
      inbox: variant.inbox,
      email: variant.email,
      modal: variant.modal,
      banner: variant.banner,
      toast: variant.toast,
    })),
  };
}

export function NotificationCampaignsSection() {
  const { t } = useTranslation(["common", "settings"]);
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const [filters, setFilters] = useState<NotificationCampaignFilters>({});
  const [ordering, setOrdering] = useState<NotificationCampaignOrdering>(DEFAULT_CAMPAIGN_ORDERING);
  const [editor, setEditor] = useState<{ open: boolean; campaignId: string | null }>({
    open: false,
    campaignId: null,
  });
  const [drawer, setDrawer] = useState<{
    campaign: NotificationCampaignSummary | null;
    tab: CampaignDetailTab;
  }>({ campaign: null, tab: "overview" });
  const [publishTarget, setPublishTarget] = useState<{
    campaign: NotificationCampaignSummary;
    scheduleAt: string;
  } | null>(null);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  const reconcile = (campaign?: NotificationCampaignSummary) => {
    if (campaign) patchCampaignCaches(queryClient, campaign);
    void queryClient.invalidateQueries({ queryKey: ["dataTable", CAMPAIGN_TABLE_ID] });
  };
  const actionMutation = useMutation({
    mutationFn: async (action: CampaignAction) => {
      if (action.kind === "publish") {
        const result = await publishNotificationCampaign(action.campaign.id, {
          expectedRevision: action.campaign.revision,
          scheduleAt: action.scheduleAt,
        });
        return result.campaign;
      }
      if (action.kind === "cancel") {
        return (await cancelNotificationCampaign(action.campaign.id, action.campaign.revision))
          .campaign;
      }
      if (action.kind === "retry") {
        await retryNotificationCampaignFailures(action.campaign.id, crypto.randomUUID());
        return undefined;
      }
      if (action.kind === "archive") {
        return archiveNotificationCampaign(action.campaign.id, action.campaign.revision);
      }
      const detail = await getNotificationCampaign(action.campaign.id);
      return createNotificationCampaign(copyCampaignPayload(detail));
    },
    onSuccess: (campaign, action) => {
      reconcile(campaign);
      setPublishTarget(null);
      notifySuccessText(
        t(`settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_${action.kind.toUpperCase()}_SUCCESS`),
      );
    },
    onError: notifyError,
  });
  const columns = useMemo(
    () =>
      createNotificationCampaignColumns({
        t,
        formatDateTime: dateTime.formatDateTime,
        pending: actionMutation.isPending,
        onView: (campaign) => setDrawer({ campaign, tab: "overview" }),
        onEdit: (campaign) => setEditor({ open: true, campaignId: campaign.id }),
        onPreview: (campaign) => setDrawer({ campaign, tab: "preview" }),
        onDeliveries: (campaign) => setDrawer({ campaign, tab: "deliveries" }),
        onDuplicate: (campaign) => actionMutation.mutate({ kind: "duplicate", campaign }),
        onPublish: (campaign) => setPublishTarget({ campaign, scheduleAt: "" }),
        onCancel: (campaign) => actionMutation.mutate({ kind: "cancel", campaign }),
        onRetry: (campaign) => actionMutation.mutate({ kind: "retry", campaign }),
        onArchive: (campaign) => actionMutation.mutate({ kind: "archive", campaign }),
      }),
    [actionMutation.isPending, dateTime.formatDateTime, t],
  );
  const tableHook = useDataTable<NotificationCampaignSummary, NotificationCampaignFilters>({
    tableId: CAMPAIGN_TABLE_ID,
    columns,
    initialState: { pageSize: 20 },
    extraQuery: filters,
    orderingOverride: ordering,
    features: { sorting: { enabled: false } },
    rowSelection: { enabled: true, getRowId: (row) => row.id },
    fetcher: (params) =>
      listNotificationCampaigns({
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: params.ordering as NotificationCampaignOrdering | undefined,
        states: params.states,
      }),
    queryOptions: { retry: false },
  });
  const selectedCampaigns = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const canBulkArchive =
    selectedCampaigns.length > 0 &&
    selectedCampaigns.every((campaign) => ARCHIVEABLE_STATES.has(campaign.state));
  const bulkArchiveMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        selectedCampaigns.map((campaign) =>
          archiveNotificationCampaign(campaign.id, campaign.revision),
        ),
      ),
    onSuccess: (campaigns) => {
      for (const campaign of campaigns) patchCampaignCaches(queryClient, campaign);
      reconcile();
      tableHook.table.resetRowSelection();
      setBulkArchiveOpen(false);
      notifySuccessText(
        t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_BULK_ARCHIVE_SUCCESS", {
          count: campaigns.length,
        }),
      );
    },
    onError: notifyError,
  });
  const toolbar = (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={tableHook.searchInput}
            onChange={tableHook.setSearchInput}
            placeholder={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />
          <NotificationCampaignFilterPopover
            value={filters}
            onChange={setFilters}
            ordering={ordering}
            onOrderingChange={setOrdering}
          />
        </>
      }
      trailing={
        <Button
          type="button"
          variant="outline"
          size="icon"
          loading={tableHook.isFetching}
          aria-label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_REFRESH")}
          onClick={() => void tableHook.refetch()}
        >
          <RefreshCw />
        </Button>
      }
    />
  );

  return (
    <SystemSettingItem
      id="global-notification-campaigns"
      title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DESC")}
      contentClassName="p-0"
      headerAction={
        <Button type="button" onClick={() => setEditor({ open: true, campaignId: null })}>
          <Plus className="size-4" />
          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CREATE")}
        </Button>
      }
    >
      <div className="min-h-[34rem]">
        <AdminDataTableSection
          table={tableHook.table}
          emptyText={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EMPTY_TITLE")}
          emptyTitle={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EMPTY_TITLE")}
          emptyDescription={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EMPTY_DESC")}
          emptyExtra={
            <Button type="button" onClick={() => setEditor({ open: true, campaignId: null })}>
              <Plus className="size-4" />
              {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CREATE")}
            </Button>
          }
          loading={tableHook.isLoading}
          error={tableHook.error}
          onRetry={() => void tableHook.refetch()}
          infiniteScroll={tableHook.infiniteScroll}
          t={(key, options) => t(key, options)}
          rowHeight="short"
          wrapHeaders
          refreshing={tableHook.isFetching && !tableHook.isLoading}
          toolbar={toolbar}
        />
      </div>
      <NotificationCampaignEditorDialog
        open={editor.open}
        campaignId={editor.campaignId}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSaved={(campaign) => reconcile(campaign)}
        onRequestPublish={(campaign, scheduleAt) =>
          setPublishTarget({
            campaign,
            scheduleAt: scheduleAt ?? "",
          })
        }
      />
      <NotificationCampaignDetailDrawer
        open={Boolean(drawer.campaign)}
        campaign={drawer.campaign}
        initialTab={drawer.tab}
        onOpenChange={(open) => {
          if (!open) setDrawer((current) => ({ ...current, campaign: null }));
        }}
      />
      <SettingDialog
        open={Boolean(publishTarget)}
        onOpenChange={(open) => !open && setPublishTarget(null)}
        title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PUBLISH_DIALOG_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PUBLISH_DIALOG_DESC", {
          name: publishTarget?.campaign.name ?? "",
        })}
        contentClassName="sm:max-w-lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPublishTarget(null)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={actionMutation.isPending}
              onClick={() => {
                if (!publishTarget) return;
                actionMutation.mutate({
                  kind: "publish",
                  campaign: publishTarget.campaign,
                  scheduleAt: publishTarget.scheduleAt
                    ? new Date(publishTarget.scheduleAt).toISOString()
                    : null,
                });
              }}
            >
              {publishTarget?.scheduleAt
                ? t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_SCHEDULE")
                : t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_PUBLISH_NOW")}
            </Button>
          </>
        }
      >
        <label className="grid gap-2 text-footnote font-medium text-label-primary">
          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_SCHEDULE_AT")}
          <Input
            type="datetime-local"
            value={publishTarget?.scheduleAt ?? ""}
            onChange={(event) =>
              setPublishTarget((current) =>
                current ? { ...current, scheduleAt: event.target.value } : current,
              )
            }
          />
          <span className="font-normal text-label-secondary">
            {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_SCHEDULE_AT_DESC")}
          </span>
        </label>
      </SettingDialog>
      <SettingDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_BULK_ARCHIVE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_BULK_ARCHIVE_DESC", {
          count: selectedCampaigns.length,
        })}
        contentClassName="sm:max-w-lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setBulkArchiveOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={bulkArchiveMutation.isPending}
              onClick={() => bulkArchiveMutation.mutate()}
            >
              {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_ARCHIVE")}
            </Button>
          </>
        }
      >
        <p className="text-footnote text-label-secondary">
          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_BULK_ARCHIVE_NOTE")}
        </p>
      </SettingDialog>
      <FloatingBulkToolbar
        visible={selectedCampaigns.length > 0}
        selectedLabel={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_SELECTED_COUNT", {
          count: selectedCampaigns.length,
        })}
        clearLabel={t("common:DATA_TABLE_CLEAR_SELECTION")}
        onClear={() => tableHook.table.resetRowSelection()}
        actions={[
          {
            key: "archive",
            label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_ARCHIVE"),
            icon: <Archive className="size-4" />,
            disabled: !canBulkArchive,
            onClick: () => setBulkArchiveOpen(true),
          },
        ]}
      />
    </SystemSettingItem>
  );
}
