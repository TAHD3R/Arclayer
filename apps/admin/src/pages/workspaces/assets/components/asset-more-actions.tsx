import { Download, ExternalLink, Pencil, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

import TrashIcon from "@arclayer/ui/icons/trash-icon";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import { downloadWithAuth } from "./asset-download";

export type AssetMoreMenuItem =
  | {
      type: "item";
      key:
        | "view_details"
        | "edit_asset"
        | "download"
        | "copy_link"
        | "open_new_tab"
        | "edit_access"
        | "delete";
      label: string;
      icon: ReactNode;
      disabled?: boolean;
      variant?: "default" | "destructive";
    }
  | { type: "separator" };

export type AssetMoreActionKey = Extract<AssetMoreMenuItem, { type: "item" }>["key"];

export function buildAssetMoreMenuItems(params: {
  t: (key: string, options?: Record<string, unknown>) => string;
  asset: AssetMasonryItem | null;
  publicUrl: string | null;
}): AssetMoreMenuItem[] {
  const { asset, publicUrl, t } = params;

  return [
    {
      type: "item",
      key: "edit_asset",
      label: t("assets:ASSET_ACTION_EDIT"),
      icon: <Pencil size={16} />,
    },
    { type: "separator" },
    {
      type: "item",
      key: "download",
      label: t("assets:ASSET_ACTION_DOWNLOAD"),
      icon: <Download size={16} />,
      disabled: !asset?.downloadUrl && !asset?.contentUrl,
    },
    { type: "separator" },
    {
      type: "item",
      key: "copy_link",
      label: t("assets:ASSET_ACTION_COPY_LINK"),
      icon: <ExternalLink size={16} />,
      disabled: !publicUrl,
    },
    {
      type: "item",
      key: "open_new_tab",
      label: t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB"),
      icon: <ExternalLink size={16} />,
      disabled: !publicUrl,
    },
    { type: "separator" },
    {
      type: "item",
      key: "edit_access",
      label: t("assets:ASSET_ACTION_EDIT_ACCESS"),
      icon: <Settings2 size={16} />,
    },
    { type: "separator" },
    {
      type: "item",
      key: "delete",
      label: t("assets:ASSET_ACTION_DELETE"),
      icon: <TrashIcon size={16} isHovered />,
      variant: "destructive",
    },
  ];
}

export async function handleAssetMoreAction(params: {
  key: AssetMoreActionKey;
  asset: AssetMasonryItem;
  publicUrl: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpenDetails: () => void;
  onOpenEditAsset: () => void;
  onOpenEditAccess: () => void;
  onOpenDelete: () => void;
}) {
  const {
    asset,
    key,
    onOpenDelete,
    onOpenDetails,
    onOpenEditAccess,
    onOpenEditAsset,
    publicUrl,
    t,
  } = params;

  if (key === "view_details") {
    onOpenDetails();
    return;
  }

  if (key === "edit_asset") {
    onOpenEditAsset();
    return;
  }

  if (key === "edit_access") {
    onOpenEditAccess();
    return;
  }

  if (key === "delete") {
    onOpenDelete();
    return;
  }

  if (key === "open_new_tab" && publicUrl) {
    window.open(publicUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (key === "copy_link") {
    if (!publicUrl) {
      notifyErrorText(t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
      return;
    }
    try {
      await copyToClipboard(publicUrl);
      notifySuccessText(t("assets:ASSET_LINK_COPIED"));
    } catch {
      notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED"));
    }
    return;
  }

  if (key !== "download") return;
  if (asset.downloadUrl) {
    window.open(asset.downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (!asset.contentUrl) return;
  try {
    await downloadWithAuth({ url: asset.contentUrl, filename: asset.name });
    notifySuccessText(t("assets:ASSET_DOWNLOAD_STARTED"));
  } catch {
    notifyErrorText(t("assets:ASSET_DOWNLOAD_FAILED"));
  }
}
