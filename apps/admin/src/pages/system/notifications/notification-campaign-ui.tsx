import {
  Bell,
  Mail,
  MessageSquareText,
  PanelTop,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  NotificationCampaignMetrics,
  NotificationCampaignState,
  NotificationPresentation,
} from "@/api/notification-campaigns";
import { BaseTag, type BaseTagColor } from "@/components/ui/tags";

const PRESENTATION_ICONS: Record<NotificationPresentation, LucideIcon> = {
  inbox: Bell,
  toast: MessageSquareText,
  modal: PanelsTopLeft,
  banner: PanelTop,
  email: Mail,
};

const STATE_COLORS: Record<NotificationCampaignState, BaseTagColor> = {
  draft: "default",
  scheduled: "blue",
  dispatching: "gold",
  completed: "green",
  partially_failed: "red",
  cancelled: "default",
  archived: "default",
};

export function CampaignStateTag(props: { state: NotificationCampaignState }) {
  const { t } = useTranslation("settings");
  return (
    <BaseTag color={STATE_COLORS[props.state]}>
      {t(`SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_STATE_${props.state.toUpperCase()}`)}
    </BaseTag>
  );
}

export function CampaignPresentationTags(props: {
  presentations: readonly NotificationPresentation[];
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {props.presentations.map((presentation) => {
        const Icon = PRESENTATION_ICONS[presentation];
        return (
          <BaseTag key={presentation} color="default">
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_${presentation.toUpperCase()}`)}
          </BaseTag>
        );
      })}
    </div>
  );
}

export function CampaignDeliverySummary(props: { metrics: NotificationCampaignMetrics }) {
  const { t } = useTranslation("settings");
  const attempted =
    props.metrics.sent + props.metrics.delivered + props.metrics.failed + props.metrics.suppressed;
  const total = Math.max(props.metrics.recipients, attempted);
  const success = props.metrics.sent + props.metrics.delivered;
  const successPercent = total > 0 ? Math.min(100, (success / total) * 100) : 0;
  const failurePercent =
    total > 0 ? Math.min(100 - successPercent, (props.metrics.failed / total) * 100) : 0;

  if (total === 0) {
    return (
      <span className="text-footnote text-label-tertiary">
        {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_NOT_STARTED")}
      </span>
    );
  }

  return (
    <div className="min-w-40 space-y-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="bg-positive" style={{ width: `${successPercent}%` }} />
        <span className="bg-destructive" style={{ width: `${failurePercent}%` }} />
      </div>
      <div className="flex items-center gap-2 text-caption tabular-nums text-label-secondary">
        <span>
          {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_SUCCESS", { count: success })}
        </span>
        {props.metrics.failed > 0 ? (
          <span className="text-destructive">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DELIVERY_FAILED", {
              count: props.metrics.failed,
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
