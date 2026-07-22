import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";

import type { GlobalNotificationSeverity } from "@/api/notifications";
import type { NotificationItem } from "@arclayer/openapi/admin-types";

type GlobalNotificationPresentation = "inbox" | "toast" | "modal" | "banner";

type GlobalNotificationMeta = {
  presentation: GlobalNotificationPresentation;
  severity: GlobalNotificationSeverity;
  actionLabel: string | null;
};

type GlobalNotificationSurfacesProps = {
  items: readonly NotificationItem[];
  onMarkRead: (item: NotificationItem) => Promise<boolean>;
  onOpenTarget: (item: NotificationItem) => Promise<boolean>;
};

const PRESENTATIONS = new Set<GlobalNotificationPresentation>([
  "inbox",
  "toast",
  "modal",
  "banner",
]);
const SEVERITIES = new Set<GlobalNotificationSeverity>(["info", "success", "warning", "error"]);

export function getGlobalNotificationMeta(item: NotificationItem): GlobalNotificationMeta | null {
  if (item.eventName !== "system.broadcast") return null;
  const meta = item.targetMeta;
  const rawPresentation = typeof meta?.presentation === "string" ? meta.presentation : "inbox";
  const rawSeverity = typeof meta?.severity === "string" ? meta.severity : "info";
  if (!PRESENTATIONS.has(rawPresentation as GlobalNotificationPresentation)) return null;
  if (!SEVERITIES.has(rawSeverity as GlobalNotificationSeverity)) return null;
  return {
    presentation: rawPresentation as GlobalNotificationPresentation,
    severity: rawSeverity as GlobalNotificationSeverity,
    actionLabel: typeof meta?.actionLabel === "string" ? meta.actionLabel : null,
  };
}

export function GlobalNotificationSurfaces({
  items,
  onMarkRead,
  onOpenTarget,
}: GlobalNotificationSurfacesProps) {
  const { t } = useTranslation("notifications");
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const visibleItems = useMemo(
    () => items.filter((item) => !dismissedIds.has(item.id)),
    [dismissedIds, items],
  );
  const bannerItem = visibleItems.find(
    (item) => getGlobalNotificationMeta(item)?.presentation === "banner",
  );
  const modalItem = visibleItems.find(
    (item) => getGlobalNotificationMeta(item)?.presentation === "modal",
  );

  const dismiss = async (item: NotificationItem) => {
    setDismissedIds((current) => new Set([...current, item.id]));
    await onMarkRead(item);
  };

  const openTarget = async (item: NotificationItem) => {
    if (await onOpenTarget(item)) {
      setDismissedIds((current) => new Set([...current, item.id]));
    }
  };

  return (
    <>
      {bannerItem ? (
        <GlobalNotificationBanner
          item={bannerItem}
          onDismiss={() => void dismiss(bannerItem)}
          onOpenTarget={() => void openTarget(bannerItem)}
        />
      ) : null}
      {modalItem ? (
        <GlobalNotificationModal
          item={modalItem}
          closeLabel={t("NOTIFICATIONS_BROADCAST_DISMISS")}
          onDismiss={() => void dismiss(modalItem)}
          onOpenTarget={() => void openTarget(modalItem)}
        />
      ) : null}
    </>
  );
}

function GlobalNotificationBanner(props: {
  item: NotificationItem;
  onDismiss: () => void;
  onOpenTarget: () => void;
}) {
  const { t } = useTranslation("notifications");
  const meta = getGlobalNotificationMeta(props.item);
  if (!meta) return null;
  const Icon = severityIcon(meta.severity);

  return (
    <div
      role="status"
      className={cn(
        "flex min-h-11 items-center gap-3 border-b px-4 py-2 text-footnote",
        severityClassName(meta.severity),
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
        <div className="font-semibold text-label-primary">{props.item.title}</div>
        {props.item.body ? (
          <div className="truncate text-label-secondary">{props.item.body}</div>
        ) : null}
      </div>
      {meta.actionLabel ? (
        <Button type="button" size="sm" variant="ghost" onClick={props.onOpenTarget}>
          {meta.actionLabel}
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={props.onDismiss}>
        {t("NOTIFICATIONS_BROADCAST_DISMISS")}
      </Button>
    </div>
  );
}

function GlobalNotificationModal(props: {
  item: NotificationItem;
  closeLabel: string;
  onDismiss: () => void;
  onOpenTarget: () => void;
}) {
  const meta = getGlobalNotificationMeta(props.item);
  if (!meta) return null;
  const Icon = severityIcon(meta.severity);

  return (
    <Dialog open onOpenChange={(open) => !open && props.onDismiss()}>
      <DialogContent closeButtonLabel={props.closeLabel} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8 text-left">
            <div
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                severityClassName(meta.severity),
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle>{props.item.title}</DialogTitle>
              {props.item.body ? (
                <DialogDescription className="mt-2 whitespace-pre-wrap">
                  {props.item.body}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onDismiss}>
            {props.closeLabel}
          </Button>
          {meta.actionLabel ? (
            <Button type="button" onClick={props.onOpenTarget}>
              {meta.actionLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function severityIcon(severity: GlobalNotificationSeverity) {
  if (severity === "success") return CheckCircle2;
  if (severity === "warning") return TriangleAlert;
  if (severity === "error") return AlertCircle;
  return Info;
}

function severityClassName(severity: GlobalNotificationSeverity): string {
  if (severity === "success") return "bg-positive/10 text-positive";
  if (severity === "warning") return "bg-warning/10 text-warning";
  if (severity === "error") return "bg-destructive/10 text-destructive";
  return "bg-primary/8 text-primary";
}
