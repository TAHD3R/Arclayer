import { ChevronLeft, ChevronRight, EllipsisVertical } from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import { ComplexDialog } from "@arclayer/ui/complex-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import { downloadWithAuth } from "./asset-masonry-tile";
import {
  useAssetPreviewDialogController,
  type AssetMoreMenuItem,
} from "./asset-preview-dialog-controller";
import { AssetPreviewHeaderMeta } from "./asset-preview-header-meta";
import { AssetPreviewSidebar } from "./asset-preview-sidebar";
import { AssetPreviewStage } from "./asset-preview-stage";
import { UpdateAssetsAccessDialog } from "./update-assets-access-dialog";

type AssetPreviewDialogProps = {
  active: AssetMasonryItem | null;
  onClose: () => void;
  items: AssetMasonryItem[];
  onSelectAsset: (asset: AssetMasonryItem) => void;
  currentFolderPathLabel: string;
};

type AssetMoreActionKey = Extract<AssetMoreMenuItem, { type: "item" }>["key"];

function PreviewToolbar(props: {
  previousAsset: AssetMasonryItem | null;
  nextAsset: AssetMasonryItem | null;
  onSelectAsset: (asset: AssetMasonryItem) => void;
  onAction: (key: AssetMoreActionKey) => void;
  menuItems: AssetMoreMenuItem[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={!props.previousAsset}
        onClick={() => props.previousAsset && props.onSelectAsset(props.previousAsset)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={!props.nextAsset}
        onClick={() => props.nextAsset && props.onSelectAsset(props.nextAsset)}
      >
        <ChevronRight className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={props.t("common:MORE")}
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {props.menuItems.map((item, index) =>
            item.type === "separator" ? (
              <DropdownMenuSeparator key={`sep:${index}`} />
            ) : (
              <DropdownMenuIconItem
                key={item.key}
                icon={item.icon}
                disabled={item.disabled}
                variant={item.variant === "destructive" ? "destructive" : "default"}
                onSelect={() => props.onAction(item.key)}
              >
                {item.label}
              </DropdownMenuIconItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function buildDialogHeightClass() {
  return "h-[min(92dvh,56rem)]! max-h-[min(92dvh,56rem)]!";
}

export function AssetPreviewDialog(props: AssetPreviewDialogProps) {
  const controller = useAssetPreviewDialogController({
    active: props.active,
    onClose: props.onClose,
  });
  const active = controller.active;
  const currentIndex = useMemo(
    () => (active ? props.items.findIndex((item) => item.id === active.id) : -1),
    [active, props.items],
  );
  const previousAsset = currentIndex > 0 ? props.items[currentIndex - 1] : null;
  const nextAsset =
    currentIndex >= 0 && currentIndex < props.items.length - 1
      ? props.items[currentIndex + 1]
      : null;

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && previousAsset) props.onSelectAsset(previousAsset);
      if (event.key === "ArrowRight" && nextAsset) props.onSelectAsset(nextAsset);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, nextAsset, previousAsset, props.onSelectAsset]);

  const handleMoreAction = (key: AssetMoreActionKey) => {
    if (!active) return;
    if (key === "edit_access") return controller.setEditAccessOpen(true);
    if (key === "delete") return controller.setDeleteOpen(true);
    if (key === "open_new_tab" && controller.publicAbsoluteUrl) {
      window.open(controller.publicAbsoluteUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (key === "copy_link") {
      if (!controller.publicAbsoluteUrl) {
        notifyErrorText(controller.t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
        return;
      }
      copyToClipboard(controller.publicAbsoluteUrl)
        .then(() => notifySuccessText(controller.t("assets:ASSET_LINK_COPIED")))
        .catch(() => notifyErrorText(controller.t("assets:ASSET_COPY_LINK_FAILED")));
      return;
    }
    if (key !== "download") return;
    if (active.downloadUrl) {
      window.open(active.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!active.contentUrl) return;
    downloadWithAuth({ url: active.contentUrl, filename: active.name })
      .then(() => notifySuccessText(controller.t("assets:ASSET_DOWNLOAD_STARTED")))
      .catch(() => notifyErrorText(controller.t("assets:ASSET_DOWNLOAD_FAILED")));
  };

  return (
    <>
      <ComplexDialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
        size="xl"
        title={active?.name ?? ""}
        description={
          active ? <AssetPreviewHeaderMeta active={active} controller={controller} /> : undefined
        }
        headerRight={
          active ? (
            <PreviewToolbar
              previousAsset={previousAsset}
              nextAsset={nextAsset}
              onSelectAsset={props.onSelectAsset}
              onAction={handleMoreAction}
              menuItems={controller.moreMenuItems}
              t={controller.t}
            />
          ) : null
        }
        contentClassName={`w-[min(96vw,96rem)]! max-w-[96rem]! ${buildDialogHeightClass()} [&>div]:h-full [&>div]:min-h-0`}
        bodyClassName="flex h-full min-h-0 gap-0 overflow-hidden bg-background p-0!"
      >
        {active ? (
          <div className="flex min-h-0 flex-1 bg-background">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border/60 bg-background">
              <div className="min-h-0 flex-1 overflow-hidden">
                <AssetPreviewStage
                  active={active}
                  activeAspectRatio={controller.activeAspectRatio}
                  previewAspectRatio={controller.previewAspectRatio}
                  setPreviewAspectRatio={controller.setPreviewAspectRatio}
                  previewSrc={controller.previewSrc}
                  setPreviewSrc={controller.setPreviewSrc}
                  previewCandidates={controller.previewCandidates}
                  failedPreviewRef={controller.failedPreviewRef}
                  t={controller.t}
                />
              </div>
            </section>

            <aside className="flex w-[24rem] min-w-0 flex-col bg-background/95 backdrop-blur-sm">
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <AssetPreviewSidebar
                  active={active}
                  controller={controller}
                  currentFolderPathLabel={props.currentFolderPathLabel}
                />
              </div>
            </aside>
          </div>
        ) : null}
      </ComplexDialog>

      <UpdateAssetsAccessDialog
        open={controller.editAccessOpen}
        onOpenChange={controller.setEditAccessOpen}
        mode="single"
        currentVisibility={controller.displayVisibility}
        currentPurpose={controller.displayPurpose}
        currentIndexable={Boolean(active?.indexable)}
        confirmLoading={controller.patchAccessMutation.isPending}
        onConfirm={async (value) => {
          await controller.patchAccessMutation.mutateAsync(value);
        }}
      />

      <AlertDialog open={controller.deleteOpen} onOpenChange={controller.setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{controller.t("assets:ASSET_DELETE_CONFIRM_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>
              {controller.t("assets:ASSET_DELETE_CONFIRM_DESC")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button variant="outline" disabled={controller.deleteMutation.isPending}>
                {controller.t("assets:ASSET_DELETE_CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={controller.deleteMutation.isPending}
                onClick={() => controller.deleteMutation.mutate()}
              >
                {controller.deleteMutation.isPending
                  ? controller.t("assets:ASSET_DELETE_DELETING")
                  : controller.t("assets:ASSET_DELETE_CONFIRM")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
