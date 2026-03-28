import * as React from "react";
import { ImagePlus, Maximize2, MoreHorizontal, PanelRightClose, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { Button } from "@arclayer/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryArticleEditorBody } from "./content-library-article-editor-body";
import { ContentLibraryCoverPickerPopover } from "./content-library-cover-picker-popover";
import { ContentLibraryArticleEditorMenu } from "./content-library-article-editor-menu";
import { ContentLibraryArticleEditorSaveIndicator } from "./content-library-article-editor-save-indicator";
import { ContentLibraryArticleEditorSeoDialog } from "./content-library-article-editor-seo-dialog";

type ContentLibraryArticleEditorShellProps = {
  workspaceId: string;
  itemId: string;
  mode: "split" | "page";
  title: string;
  summary: string;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  onVisibilityChange: (value: "public" | "private") => void;
  coverAssetId: string;
  onCoverAssetIdChange: (value: string) => void;
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    robotsDirective: string;
  };
  onSeoChange: (value: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
    robotsDirective?: string;
  }) => void;
  bodyDocument?: Record<string, unknown>;
  onBodyDocumentChange?: (value: Record<string, unknown>) => void;
  saveState?: "hidden" | "saving" | "saved" | "error";
  isPublishing?: boolean;
  hasPublishableVersion?: boolean;
  onPublish?: () => void;
  onClose?: () => void;
  onOpenPage?: () => void;
  className?: string;
};

function ToolbarIconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        <Button type="button" variant="ghost" size="icon-sm" onClick={props.onClick}>
          {props.children}
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

function HeaderActionButton(props: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 rounded-full px-3 text-callout text-label-secondary hover:text-foreground"
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </Button>
  );
}

export function ContentLibraryArticleEditorShell(props: ContentLibraryArticleEditorShellProps) {
  const { t } = useTranslation(["content", "common"]);
  const [coverPopoverOpen, setCoverPopoverOpen] = React.useState(false);
  const [seoDialogOpen, setSeoDialogOpen] = React.useState(false);
  const pageFrameClass = "w-full";
  const textLaneClass =
    props.mode === "page"
      ? "mx-auto flex w-full max-w-[76rem] flex-col px-10 pl-24"
      : "flex w-full flex-col px-6 pl-24";
  const coverImageUrl = React.useMemo(
    () => resolveAssetRefToPublicUrlPath(props.coverAssetId),
    [props.coverAssetId],
  );

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-background", props.className)}
    >
      <TooltipProvider>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-background px-3">
          <div className="flex items-center gap-1">
            {props.mode === "split" && props.onClose ? (
              <ToolbarIconButton
                label={t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")}
                onClick={props.onClose}
              >
                <PanelRightClose className="size-4" />
              </ToolbarIconButton>
            ) : null}
            {props.mode === "split" && props.onOpenPage ? (
              <ToolbarIconButton
                label={t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")}
                onClick={props.onOpenPage}
              >
                <Maximize2 className="size-4" />
              </ToolbarIconButton>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <ContentLibraryArticleEditorSaveIndicator
              state={props.saveState ?? "hidden"}
              isPublishing={props.isPublishing}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!props.hasPublishableVersion || props.isPublishing}
              onClick={props.onPublish}
            >
              {t("CONTENT_LIBRARY_ACTION_PUBLISH")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <ContentLibraryArticleEditorMenu
                status={props.status}
                visibility={props.visibility}
                onVisibilityChange={props.onVisibilityChange}
                slug={props.slug}
                onSlugChange={props.onSlugChange}
              />
            </DropdownMenu>
          </div>
        </div>
      </TooltipProvider>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          {coverImageUrl ? (
            <div className={cn(pageFrameClass, props.mode === "page" ? "pt-0" : "px-3 pt-3")}>
              <div
                className={cn(
                  "group/cover relative overflow-hidden bg-muted/20",
                  props.mode === "page"
                    ? "border-b border-border/70"
                    : "rounded-[30px] border border-border/70",
                )}
              >
                <div className="relative aspect-[3.15/1]">
                  <LazyAssetImage
                    eager
                    src={coverImageUrl}
                    alt={t("CONTENT_LIBRARY_EDITOR_COVER_ALT", {
                      title: props.title || t("CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER"),
                    })}
                    rootClassName="absolute inset-0"
                    className="object-cover"
                    showErrorOverlay
                  />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 via-black/10 to-transparent" />
                <div className="absolute right-4 top-4 opacity-0 transition-opacity duration-150 group-hover/cover:opacity-100 group-focus-within/cover:opacity-100">
                  <ContentLibraryCoverPickerPopover
                    workspaceId={props.workspaceId}
                    value={props.coverAssetId}
                    open={coverPopoverOpen}
                    onOpenChange={setCoverPopoverOpen}
                    onChange={props.onCoverAssetIdChange}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-9 rounded-xl px-3 shadow-sm"
                    >
                      {t("CONTENT_LIBRARY_EDITOR_CHANGE_COVER")}
                    </Button>
                  </ContentLibraryCoverPickerPopover>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "group/header",
              textLaneClass,
              props.mode === "page"
                ? props.coverAssetId
                  ? "pt-6"
                  : "pt-8"
                : props.coverAssetId
                  ? "pt-4"
                  : "pt-6",
              "space-y-3",
            )}
          >
            <div className="flex h-8 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100">
              <ContentLibraryCoverPickerPopover
                workspaceId={props.workspaceId}
                value={props.coverAssetId}
                open={coverPopoverOpen}
                onOpenChange={setCoverPopoverOpen}
                onChange={props.onCoverAssetIdChange}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-callout text-label-secondary hover:text-foreground"
                >
                  <ImagePlus className="size-4" />
                  {t(
                    props.coverAssetId
                      ? "CONTENT_LIBRARY_EDITOR_CHANGE_COVER"
                      : "CONTENT_LIBRARY_EDITOR_ADD_COVER",
                  )}
                </Button>
              </ContentLibraryCoverPickerPopover>
              <HeaderActionButton
                icon={<Search className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_OPEN_SEO_DIALOG")}
                onClick={() => setSeoDialogOpen(true)}
              />
            </div>

            <input
              type="text"
              value={props.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              placeholder={t("CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER")}
              className={cn(
                "w-full appearance-none border-none bg-transparent p-0 font-semibold leading-[0.94] tracking-[-0.045em] text-foreground outline-none placeholder:text-label-tertiary",
                props.mode === "page"
                  ? "text-[clamp(1.85rem,3.6vw,2.8rem)]"
                  : "text-[clamp(1.55rem,4vw,2.15rem)]",
              )}
            />

            <textarea
              value={props.summary}
              onChange={(event) => props.onSummaryChange(event.target.value)}
              placeholder={t("CONTENT_LIBRARY_EDITOR_SUMMARY_PLACEHOLDER")}
              className="field-sizing-content min-h-0 w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[1.02rem] leading-7 text-label-secondary outline-none placeholder:text-label-tertiary dark:bg-transparent"
              rows={2}
            />
          </div>

          <div
            className={cn("flex min-h-0 flex-1 flex-col", props.mode === "page" ? "mt-8" : "mt-5")}
          >
            <ContentLibraryArticleEditorBody
              workspaceId={props.workspaceId}
              editorIdentity={`${props.workspaceId}:${props.itemId}`}
              document={props.bodyDocument}
              placeholder={t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
              mode={props.mode}
              onChange={props.onBodyDocumentChange}
            />
          </div>
        </div>
      </div>

      <ContentLibraryArticleEditorSeoDialog
        open={seoDialogOpen}
        seo={props.seo}
        onOpenChange={setSeoDialogOpen}
        onSeoChange={props.onSeoChange}
      />
    </div>
  );
}
