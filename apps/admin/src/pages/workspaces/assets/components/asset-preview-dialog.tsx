import { ChevronLeft, ChevronRight, EllipsisVertical, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@arclayer/ui/breadcrumb";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";

import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
  type WorkspaceAvatarIdentity,
} from "@/components/common/entity-avatar";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import {
  buildAssetMoreMenuItems,
  handleAssetMoreAction,
  type AssetMoreActionKey,
  type AssetMoreMenuItem,
} from "./asset-more-actions";
import { useAssetPreviewDialogController } from "./asset-preview-dialog-controller";
import { AssetPreviewSidebar } from "./asset-preview-sidebar";
import { AssetPreviewStage } from "./asset-preview-stage";
import { UpdateAssetsAccessDialog } from "./update-assets-access-dialog";

type AssetPreviewDialogProps = {
  projectId: string;
  active: AssetMasonryItem | null;
  onClose: () => void;
  items: AssetMasonryItem[];
  onSelectAsset: (asset: AssetMasonryItem) => void;
  currentFolderPathLabel: string;
  folderBreadcrumbs: string[];
  workspaceBreadcrumb: AssetPreviewWorkspaceBreadcrumb | null;
  onOpenEditAsset: (asset: AssetMasonryItem) => void;
  canManageAssets?: boolean;
};

export type AssetPreviewWorkspaceBreadcrumb = {
  name: string;
} & WorkspaceAvatarIdentity;

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

export function AssetPreviewDialog(props: AssetPreviewDialogProps) {
  const controller = useAssetPreviewDialogController({
    projectId: props.projectId,
    active: props.active,
    onClose: props.onClose,
  });
  const titleId = useId();
  const active = controller.active;
  const canManageAssets = props.canManageAssets !== false;
  const currentIndex = useMemo(
    () => (active ? props.items.findIndex((item) => item.id === active.id) : -1),
    [active, props.items],
  );
  const previousAsset = currentIndex > 0 ? props.items[currentIndex - 1] : null;
  const nextAsset =
    currentIndex >= 0 && currentIndex < props.items.length - 1
      ? props.items[currentIndex + 1]
      : null;
  const moreMenuItems = useMemo<AssetMoreMenuItem[]>(() => {
    const items = buildAssetMoreMenuItems({
      t: controller.t,
      asset: active,
      publicUrl: controller.publicAbsoluteUrl,
    });
    return items.map((item) => {
      if (item.type === "separator") return item;
      if (
        !canManageAssets &&
        (item.key === "edit_asset" || item.key === "edit_access" || item.key === "delete")
      ) {
        return {
          type: "item" as const,
          key: item.key,
          label: item.label,
          icon: item.icon,
          disabled: true,
          variant: item.variant,
        };
      }
      return item;
    });
  }, [active, canManageAssets, controller.publicAbsoluteUrl, controller.t]);

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
    if (!canManageAssets && (key === "edit_asset" || key === "edit_access" || key === "delete")) {
      return;
    }
    void handleAssetMoreAction({
      key,
      asset: active,
      publicUrl: controller.publicAbsoluteUrl,
      t: controller.t,
      onOpenDetails: () => props.onSelectAsset(active),
      onOpenEditAsset: () => props.onOpenEditAsset(active),
      onOpenEditAccess: () => controller.setEditAccessOpen(true),
      onOpenDelete: () => controller.setDeleteOpen(true),
    });
  };

  return (
    <>
      <ExpandableScreen
        expanded={Boolean(active)}
        onExpandChange={(open) => {
          if (!open) props.onClose();
        }}
        layoutId="asset-preview-dialog"
      >
        <ExpandableScreenContent
          showCloseButton={false}
          className="border border-border/80 bg-background shadow-2xl"
        >
          {active ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex items-center gap-4 border-b border-border/70 bg-muted px-6 py-4 sm:px-8 sm:py-5">
                <div className="min-w-0 flex-1">
                  <Breadcrumb>
                    <BreadcrumbList className="m-0 mb-0! flex-nowrap overflow-hidden whitespace-nowrap p-0 text-callout">
                      {props.workspaceBreadcrumb ? (
                        <BreadcrumbItem className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2 truncate text-label-secondary">
                            <WorkspaceAvatar
                              name={props.workspaceBreadcrumb.name}
                              size={18}
                              className="rounded-[4px]"
                              {...workspaceAvatarPropsFromIdentity(props.workspaceBreadcrumb)}
                            />
                            <span className="truncate">{props.workspaceBreadcrumb.name}</span>
                          </span>
                        </BreadcrumbItem>
                      ) : null}

                      {(props.workspaceBreadcrumb
                        ? [controller.t("assets:ASSET_BREADCRUMB_ROOT"), ...props.folderBreadcrumbs]
                        : props.folderBreadcrumbs
                      ).map((segment, index) => (
                        <Fragment key={`${segment}-${index}`}>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem className="min-w-0">
                            <span className="flex min-w-0 items-center gap-2 truncate text-label-secondary">
                              <span className="truncate">{segment}</span>
                            </span>
                          </BreadcrumbItem>
                        </Fragment>
                      ))}

                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0">
                        <h2
                          id={titleId}
                          className="truncate text-callout font-semibold text-label-primary"
                        >
                          {active.name}
                        </h2>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <PreviewToolbar
                    previousAsset={previousAsset}
                    nextAsset={nextAsset}
                    onSelectAsset={props.onSelectAsset}
                    onAction={handleMoreAction}
                    menuItems={moreMenuItems}
                    t={controller.t}
                  />
                  <div className="mx-1 h-4 w-px bg-border/70" aria-hidden="true" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Close"
                    onClick={props.onClose}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 gap-0 overflow-hidden bg-card">
                <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border/60 bg-card">
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

                <aside className="flex w-[24rem] min-w-0 flex-col bg-card/95 backdrop-blur-sm">
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    <AssetPreviewSidebar
                      active={active}
                      controller={controller}
                      currentFolderPathLabel={props.currentFolderPathLabel}
                    />
                  </div>
                </aside>
              </div>
            </div>
          ) : null}
        </ExpandableScreenContent>
      </ExpandableScreen>

      <UpdateAssetsAccessDialog
        open={controller.editAccessOpen}
        onOpenChange={controller.setEditAccessOpen}
        mode="single"
        currentVisibility={controller.displayVisibility}
        currentPurpose={controller.displayPurpose}
        currentIndexable={Boolean(active?.indexable)}
        confirmLoading={controller.patchAccessMutation.isPending}
        onConfirm={async (value) => {
          if (!canManageAssets) return;
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
                disabled={!canManageAssets}
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
