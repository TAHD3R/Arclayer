import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import type {
  NotificationExternalHttpsAction,
  NotificationInternalRouteAction,
  NotificationOut as NotificationItem,
} from "@arclayer/openapi";
import type { NotificationNavigationTarget } from "@/lib/routing/notification-target";

export type GlobalNotificationAction =
  | ({ kind: "internal_route" } & NotificationInternalRouteAction)
  | ({ kind: "external_https" } & NotificationExternalHttpsAction);
export type GlobalNotificationMeta = NonNullable<NotificationItem["campaignSurface"]>;
type GlobalNotificationPresentation = GlobalNotificationMeta["presentation"];
type GlobalNotificationMetaFor<Presentation extends GlobalNotificationPresentation> = Extract<
  GlobalNotificationMeta,
  { presentation: Presentation }
>;
type GlobalNotificationCandidate<Presentation extends GlobalNotificationPresentation> = {
  item: NotificationItem;
  meta: GlobalNotificationMetaFor<Presentation>;
};

type GlobalNotificationSurfacesProps = {
  items: readonly NotificationItem[];
  onRecordInteraction: (
    item: NotificationItem,
    interaction: "click" | "dismiss",
  ) => Promise<boolean>;
  onOpenTarget: (item: NotificationItem, target: NotificationNavigationTarget) => Promise<boolean>;
};

export function getGlobalNotificationMeta(item: NotificationItem): GlobalNotificationMeta | null {
  if (item.eventName !== "system.broadcast") return null;
  return item.campaignSurface ?? null;
}

function isWithinDisplayWindow(meta: GlobalNotificationMeta, now: number): boolean {
  if (meta.displayStartAt && Date.parse(meta.displayStartAt) > now) return false;
  if (meta.displayEndAt && Date.parse(meta.displayEndAt) <= now) return false;
  return true;
}

export function GlobalNotificationSurfaces({
  items,
  onRecordInteraction,
  onOpenTarget,
}: GlobalNotificationSurfacesProps) {
  const { t } = useTranslation("notifications");
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const eligibleItems = useMemo(() => {
    const now = Date.now();
    return items
      .map((item) => ({ item, meta: getGlobalNotificationMeta(item) }))
      .filter(
        (candidate): candidate is { item: NotificationItem; meta: GlobalNotificationMeta } =>
          candidate.meta !== null &&
          !dismissedIds.has(candidate.item.id) &&
          isWithinDisplayWindow(candidate.meta, now),
      )
      .sort(
        (left, right) =>
          right.meta.priority - left.meta.priority ||
          Date.parse(left.item.createdAt) - Date.parse(right.item.createdAt),
      );
  }, [dismissedIds, items]);
  const banner = eligibleItems.find(
    (candidate): candidate is GlobalNotificationCandidate<"banner"> =>
      candidate.meta.presentation === "banner",
  );
  const modal = eligibleItems.find(
    (candidate): candidate is GlobalNotificationCandidate<"modal"> =>
      candidate.meta.presentation === "modal",
  );

  const hide = (item: NotificationItem) => {
    setDismissedIds((current) => new Set([...current, item.id]));
  };
  const dismiss = async (item: NotificationItem) => {
    if (await onRecordInteraction(item, "dismiss")) hide(item);
  };
  const openAction = async (item: NotificationItem, action: GlobalNotificationAction) => {
    const opened =
      action.kind === "internal_route"
        ? await onOpenTarget(item, action.target)
        : window.open(action.target, "_blank", "noopener,noreferrer") !== null;
    if (!opened) return;
    if (await onRecordInteraction(item, "click")) hide(item);
  };

  return (
    <>
      {banner ? (
        <GlobalNotificationBanner
          item={banner.item}
          meta={banner.meta}
          dismissLabel={t("NOTIFICATIONS_BROADCAST_DISMISS")}
          onDismiss={() => void dismiss(banner.item)}
          onAction={(action) => void openAction(banner.item, action)}
        />
      ) : null}
      {modal ? (
        <GlobalNotificationModal
          item={modal.item}
          meta={modal.meta}
          closeLabel={t("NOTIFICATIONS_BROADCAST_DISMISS")}
          onDismiss={() => void dismiss(modal.item)}
          onAction={(action) => void openAction(modal.item, action)}
        />
      ) : null}
    </>
  );
}

function GlobalNotificationBanner(props: {
  item: NotificationItem;
  meta: GlobalNotificationMetaFor<"banner">;
  dismissLabel: string;
  onDismiss: () => void;
  onAction: (action: GlobalNotificationAction) => void;
}) {
  const payload = props.meta.payload;
  return (
    <div
      role="status"
      className="flex min-h-11 items-center gap-3 border-b bg-primary/[0.06] px-4 py-2 text-footnote text-label-primary"
    >
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
        <div className="font-semibold">{payload.title}</div>
        {payload.body ? <div className="truncate text-label-secondary">{payload.body}</div> : null}
      </div>
      {payload.action ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => props.onAction(payload.action!)}
        >
          {payload.action.label}
        </Button>
      ) : null}
      {payload.dismissible !== false ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={props.dismissLabel}
          onClick={props.onDismiss}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function GlobalNotificationModal(props: {
  item: NotificationItem;
  meta: GlobalNotificationMetaFor<"modal">;
  closeLabel: string;
  onDismiss: () => void;
  onAction: (action: GlobalNotificationAction) => void;
}) {
  const payload = props.meta.payload;
  const dismissible = payload.dismissPolicy !== "action_required";
  const mediaUrl = payload.media ? resolveAssetRefToPublicUrlPath(payload.media.assetId) : null;
  const posterUrl = payload.media?.posterAssetId
    ? resolveAssetRefToPublicUrlPath(payload.media.posterAssetId)
    : undefined;
  const captionsUrl = payload.media?.captionsAssetId
    ? resolveAssetRefToPublicUrlPath(payload.media.captionsAssetId)
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismissible && props.onDismiss()}>
      <DialogContent
        closeButtonLabel={props.closeLabel}
        showCloseButton={dismissible}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        className="overflow-hidden p-0 sm:max-w-xl"
      >
        {payload.media && mediaUrl ? (
          payload.media.kind === "image" ? (
            <img
              src={mediaUrl}
              alt={payload.media.altText}
              className="aspect-[16/7] w-full object-cover"
            />
          ) : (
            <video
              src={mediaUrl}
              poster={posterUrl}
              controls
              preload="metadata"
              aria-label={payload.media.altText}
              className="aspect-video w-full bg-black object-contain"
            >
              {captionsUrl ? (
                <track kind="captions" src={captionsUrl} srcLang="en" label="Captions" default />
              ) : null}
            </video>
          )
        ) : null}
        <div className="px-6 pb-6 pt-5">
          <DialogHeader className="text-left">
            <DialogTitle>{payload.title}</DialogTitle>
            {payload.body ? (
              <DialogDescription className="mt-2 whitespace-pre-wrap leading-6">
                {payload.body}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter className="mt-6">
            {dismissible ? (
              <Button type="button" variant="outline" onClick={props.onDismiss}>
                {props.closeLabel}
              </Button>
            ) : null}
            {payload.secondaryAction ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => props.onAction(payload.secondaryAction!)}
              >
                {payload.secondaryAction.label}
              </Button>
            ) : null}
            <Button type="button" onClick={() => props.onAction(payload.primaryAction)}>
              {payload.primaryAction.label}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
