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
import type { NotificationItem } from "@arclayer/openapi/admin-types";

type GlobalNotificationPresentation = "inbox" | "toast" | "modal" | "banner";
type SurfaceAction = {
  kind: "internal_route" | "external_https";
  label: string;
  target: string;
};
type SurfaceMedia = {
  assetId: string;
  kind: "image" | "video";
  altText: string;
  posterAssetId: string | null;
  captionsAssetId: string | null;
};
type SurfacePayload = {
  title: string;
  body: string | null;
  action: SurfaceAction | null;
  primaryAction: SurfaceAction | null;
  secondaryAction: SurfaceAction | null;
  dismissible: boolean;
  dismissPolicy: "dismissible" | "action_required";
  media: SurfaceMedia | null;
};

export type GlobalNotificationMeta = {
  campaignId: string;
  deliveryId: string;
  presentation: GlobalNotificationPresentation;
  priority: number;
  displayStartAt: string | null;
  displayEndAt: string | null;
  payload: SurfacePayload;
};

type GlobalNotificationSurfacesProps = {
  items: readonly NotificationItem[];
  onRecordInteraction: (
    item: NotificationItem,
    interaction: "click" | "dismiss",
  ) => Promise<boolean>;
  onOpenTarget: (item: NotificationItem) => Promise<boolean>;
};

const PRESENTATIONS = new Set<GlobalNotificationPresentation>([
  "inbox",
  "toast",
  "modal",
  "banner",
]);

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function actionValue(value: unknown): SurfaceAction | null {
  if (value === null || value === undefined) return null;
  const action = recordValue(value);
  if (!action) return null;
  if (action.kind !== "internal_route" && action.kind !== "external_https") return null;
  if (typeof action.label !== "string" || typeof action.target !== "string") return null;
  return { kind: action.kind, label: action.label, target: action.target };
}

function mediaValue(value: unknown): SurfaceMedia | null {
  if (value === null || value === undefined) return null;
  const media = recordValue(value);
  if (!media || (media.kind !== "image" && media.kind !== "video")) return null;
  if (
    typeof media.assetId !== "string" ||
    typeof media.altText !== "string" ||
    (media.posterAssetId !== null &&
      media.posterAssetId !== undefined &&
      typeof media.posterAssetId !== "string") ||
    (media.captionsAssetId !== null &&
      media.captionsAssetId !== undefined &&
      typeof media.captionsAssetId !== "string")
  ) {
    return null;
  }
  return {
    assetId: media.assetId,
    kind: media.kind,
    altText: media.altText,
    posterAssetId: (media.posterAssetId as string | null | undefined) ?? null,
    captionsAssetId: (media.captionsAssetId as string | null | undefined) ?? null,
  };
}

function payloadValue(
  value: unknown,
  presentation: GlobalNotificationPresentation,
): SurfacePayload | null {
  const payload = recordValue(value);
  if (!payload || typeof payload.title !== "string") return null;
  if (payload.body !== null && payload.body !== undefined && typeof payload.body !== "string") {
    return null;
  }
  const primaryAction = actionValue(payload.primaryAction);
  if (presentation === "modal" && !primaryAction) return null;
  const dismissPolicy =
    payload.dismissPolicy === "action_required" ? "action_required" : "dismissible";
  return {
    title: payload.title,
    body: typeof payload.body === "string" ? payload.body : null,
    action: actionValue(payload.action),
    primaryAction,
    secondaryAction: actionValue(payload.secondaryAction),
    dismissible: payload.dismissible !== false,
    dismissPolicy,
    media: mediaValue(payload.media),
  };
}

function optionalDateValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}

export function getGlobalNotificationMeta(item: NotificationItem): GlobalNotificationMeta | null {
  if (item.eventName !== "system.broadcast") return null;
  const meta = recordValue(item.targetMeta);
  if (!meta || typeof meta.presentation !== "string") return null;
  if (!PRESENTATIONS.has(meta.presentation as GlobalNotificationPresentation)) return null;
  if (
    typeof meta.campaignId !== "string" ||
    typeof meta.deliveryId !== "string" ||
    typeof meta.priority !== "number"
  ) {
    return null;
  }
  const presentation = meta.presentation as GlobalNotificationPresentation;
  const payload = payloadValue(meta.payload, presentation);
  const displayStartAt = optionalDateValue(meta.displayStartAt);
  const displayEndAt = optionalDateValue(meta.displayEndAt);
  if (!payload || displayStartAt === undefined || displayEndAt === undefined) return null;
  return {
    campaignId: meta.campaignId,
    deliveryId: meta.deliveryId,
    presentation,
    priority: meta.priority,
    displayStartAt,
    displayEndAt,
    payload,
  };
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
  const banner = eligibleItems.find(({ meta }) => meta.presentation === "banner");
  const modal = eligibleItems.find(({ meta }) => meta.presentation === "modal");

  const hide = (item: NotificationItem) => {
    setDismissedIds((current) => new Set([...current, item.id]));
  };
  const dismiss = async (item: NotificationItem) => {
    if (await onRecordInteraction(item, "dismiss")) hide(item);
  };
  const openAction = async (item: NotificationItem, action: SurfaceAction) => {
    const opened =
      action.kind === "internal_route"
        ? await onOpenTarget({ ...item, targetTo: action.target })
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
  meta: GlobalNotificationMeta;
  dismissLabel: string;
  onDismiss: () => void;
  onAction: (action: SurfaceAction) => void;
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
      {payload.dismissible ? (
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
  meta: GlobalNotificationMeta;
  closeLabel: string;
  onDismiss: () => void;
  onAction: (action: SurfaceAction) => void;
}) {
  const payload = props.meta.payload;
  const dismissible = payload.dismissPolicy === "dismissible";
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
            {payload.primaryAction ? (
              <Button type="button" onClick={() => props.onAction(payload.primaryAction!)}>
                {payload.primaryAction.label}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
