import { useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Ban, Copy, Ellipsis, Eye, Pencil, RefreshCw, Send, Truck } from "lucide-react";

import type { NotificationCampaignSummary } from "@/api/notification-campaigns";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { BaseTag } from "@/components/ui/tags";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import {
  CampaignDeliverySummary,
  CampaignPresentationTags,
  CampaignStateTag,
} from "./notification-campaign-ui";

type Translate = (key: string, options?: Record<string, unknown>) => string;

type CampaignColumnOptions = {
  t: Translate;
  formatDateTime: (value: string) => string;
  pending: boolean;
  onView: (campaign: NotificationCampaignSummary) => void;
  onEdit: (campaign: NotificationCampaignSummary) => void;
  onPreview: (campaign: NotificationCampaignSummary) => void;
  onDuplicate: (campaign: NotificationCampaignSummary) => void;
  onPublish: (campaign: NotificationCampaignSummary) => void;
  onCancel: (campaign: NotificationCampaignSummary) => void;
  onDeliveries: (campaign: NotificationCampaignSummary) => void;
  onRetry: (campaign: NotificationCampaignSummary) => void;
  onArchive: (campaign: NotificationCampaignSummary) => void;
};

function ownerName(campaign: NotificationCampaignSummary): string {
  return campaign.owner.displayName || campaign.owner.username;
}

function ownerInitials(campaign: NotificationCampaignSummary): string {
  return ownerName(campaign).slice(0, 2).toUpperCase();
}

function campaignAudienceLabel(campaign: NotificationCampaignSummary, t: Translate): string {
  const kind = t(
    `settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_AUDIENCE_${campaign.audience.kind.toUpperCase()}`,
  );
  if (campaign.audienceEstimate === null || campaign.audienceEstimate === undefined) return kind;
  return `${kind} · ${campaign.audienceEstimate}`;
}

function CampaignRowActions(props: {
  campaign: NotificationCampaignSummary;
  options: CampaignColumnOptions;
}) {
  const { campaign, options } = props;
  const isDraft = campaign.state === "draft";
  const canCancel = campaign.state === "scheduled" || campaign.state === "dispatching";
  const canRetry = campaign.state === "partially_failed" && campaign.metrics.failed > 0;
  const canArchive = ["completed", "partially_failed", "cancelled"].includes(campaign.state);
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingOverlayActionRef = useRef<(() => void) | null>(null);
  const openOverlayAfterMenuCloses = (action: () => void) => {
    pendingOverlayActionRef.current = action;
  };
  const handleMenuCloseAutoFocus = () => {
    const action = pendingOverlayActionRef.current;
    pendingOverlayActionRef.current = null;
    if (!action) return;
    window.setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      action();
    }, 0);
  };

  return (
    <DataTableActionsCell>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => (isDraft ? options.onEdit(campaign) : options.onView(campaign))}
      >
        {isDraft ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
        {options.t(
          isDraft
            ? "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_EDIT"
            : "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_VIEW",
        )}
      </Button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_MORE")}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={handleMenuCloseAutoFocus}>
          <DropdownMenuIconItem
            icon={<Eye />}
            onSelect={() => openOverlayAfterMenuCloses(() => options.onPreview(campaign))}
          >
            {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_PREVIEW")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Truck />}
            disabled={isDraft}
            onSelect={() => openOverlayAfterMenuCloses(() => options.onDeliveries(campaign))}
          >
            {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_DELIVERIES")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Copy />}
            disabled={options.pending}
            onSelect={() => options.onDuplicate(campaign)}
          >
            {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_DUPLICATE")}
          </DropdownMenuIconItem>
          <DropdownMenuSeparator />
          {isDraft ? (
            <DropdownMenuIconItem
              icon={<Send />}
              disabled={options.pending}
              onSelect={() => openOverlayAfterMenuCloses(() => options.onPublish(campaign))}
            >
              {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_PUBLISH")}
            </DropdownMenuIconItem>
          ) : null}
          {canCancel ? (
            <DropdownMenuIconItem
              icon={<Ban />}
              disabled={options.pending}
              onSelect={() => options.onCancel(campaign)}
            >
              {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_CANCEL")}
            </DropdownMenuIconItem>
          ) : null}
          {canRetry ? (
            <DropdownMenuIconItem
              icon={<RefreshCw />}
              disabled={options.pending}
              onSelect={() => options.onRetry(campaign)}
            >
              {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_RETRY")}
            </DropdownMenuIconItem>
          ) : null}
          {canArchive ? (
            <DropdownMenuIconItem
              icon={<Archive />}
              disabled={options.pending}
              onSelect={() => options.onArchive(campaign)}
            >
              {options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_ARCHIVE")}
            </DropdownMenuIconItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </DataTableActionsCell>
  );
}

export function createNotificationCampaignColumns(
  options: CampaignColumnOptions,
): ColumnDef<NotificationCampaignSummary, unknown>[] {
  return [
    {
      id: "campaign",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_CAMPAIGN"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_CAMPAIGN"),
        kind: "primary",
      },
      cell: ({ row }) => (
        <div className="min-w-0 py-0.5">
          <div className="truncate font-semibold text-label-primary">{row.original.name}</div>
          <div className="mt-0.5 truncate text-caption text-label-tertiary">
            {row.original.internalDescription ||
              options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_NO_DESCRIPTION")}
          </div>
        </div>
      ),
      size: 260,
      minSize: 220,
    },
    {
      id: "state",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_STATE"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_STATE"),
        kind: "meta",
      },
      cell: ({ row }) => <CampaignStateTag state={row.original.state} />,
      size: 130,
    },
    {
      id: "channels",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_CHANNELS"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_CHANNELS"),
        kind: "meta",
      },
      cell: ({ row }) => <CampaignPresentationTags presentations={row.original.presentations} />,
      size: 230,
      minSize: 180,
    },
    {
      id: "audience",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_AUDIENCE"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_AUDIENCE"),
        kind: "meta",
      },
      cell: ({ row }) => (
        <BaseTag color="default">{campaignAudienceLabel(row.original, options.t)}</BaseTag>
      ),
      size: 180,
    },
    {
      id: "schedule",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_SCHEDULE"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_SCHEDULE"),
        kind: "meta",
      },
      cell: ({ row }) => (
        <span className="block truncate text-footnote text-label-secondary">
          {row.original.scheduleAt
            ? options.formatDateTime(row.original.scheduleAt)
            : options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_SCHEDULE_IMMEDIATE")}
        </span>
      ),
      size: 190,
    },
    {
      id: "delivery",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_DELIVERY"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_DELIVERY"),
        kind: "meta",
      },
      cell: ({ row }) => <CampaignDeliverySummary metrics={row.original.metrics} />,
      size: 220,
      minSize: 180,
    },
    {
      id: "owner",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_OWNER"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_OWNER"),
        kind: "meta",
      },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-7 shrink-0">
            {row.original.owner.avatarUrl ? (
              <AvatarImage src={row.original.owner.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-caption">{ownerInitials(row.original)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-footnote">{ownerName(row.original)}</span>
        </div>
      ),
      size: 170,
    },
    {
      id: "updated",
      header: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_UPDATED"),
      meta: {
        title: options.t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_UPDATED"),
        kind: "meta",
      },
      cell: ({ row }) => (
        <span className="block truncate text-footnote text-label-secondary">
          {options.formatDateTime(row.original.updatedAt)}
        </span>
      ),
      size: 180,
    },
    {
      id: "actions",
      header: "",
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableHiding: false,
      cell: ({ row }) => <CampaignRowActions campaign={row.original} options={options} />,
      size: 190,
      minSize: 180,
    },
  ];
}
