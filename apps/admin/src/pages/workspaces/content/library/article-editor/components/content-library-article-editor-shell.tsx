import * as React from "react";
import {
  ImagePlus,
  Maximize2,
  MoreHorizontal,
  PanelRightClose,
  Search,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEditorScrollRef } from "platejs/react";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { Button } from "@arclayer/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryArticleEditorBody } from "./content-library-article-editor-body";
import {
  ContentLibraryArticleEditorDocumentProvider,
  useContentLibraryArticleEditorDocumentState,
} from "./content-library-article-editor-document";
import { ContentLibraryCoverPickerPopover } from "./content-library-cover-picker-popover";
import { ContentLibraryArticleEditorMenu } from "./content-library-article-editor-menu";
import { ContentLibraryArticleEditorPageToolbar } from "./content-library-article-editor-page-toolbar";
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
  isLoading?: boolean;
  saveState?: "hidden" | "saving" | "saved" | "error";
  saveError?: unknown;
  isPublishing?: boolean;
  hasPublishableVersion?: boolean;
  onPublish?: () => void;
  onClose?: () => void;
  onOpenPage?: () => void;
  className?: string;
};

function ContentLibraryArticleEditorLoadingSkeleton(props: {
  bodyClassName?: string;
  mode: "split" | "page";
  showHeaderSkeleton?: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", props.bodyClassName)}>
      {props.showHeaderSkeleton ? (
        <div
          className={cn(
            props.mode === "page"
              ? "mx-auto flex w-full max-w-[76rem] flex-col px-6"
              : "flex w-full flex-col px-4",
            "space-y-3",
          )}
        >
          <Skeleton className="h-12 w-full max-w-[30rem] rounded-xl" />
          <Skeleton className="h-6 w-full max-w-[42rem] rounded-xl" />
          <Skeleton className="h-6 w-full max-w-[28rem] rounded-xl" />
        </div>
      ) : null}

      <div className={cn("flex min-h-0 flex-1 flex-col", props.showHeaderSkeleton ? "mt-8" : "")}>
        <div
          role="status"
          aria-live="polite"
          className={cn(
            props.mode === "page"
              ? "mx-auto flex w-full max-w-[76rem] flex-1 flex-col px-6"
              : "flex w-full flex-1 flex-col px-4",
          )}
        >
          <div className="space-y-3 pt-2">
            <Skeleton className="h-5 w-full max-w-[22rem] rounded-full" />
            <Skeleton className="h-5 w-full max-w-[30rem] rounded-full" />
            <Skeleton className="h-5 w-full max-w-[26rem] rounded-full" />
            <Skeleton className="h-5 w-full max-w-[34rem] rounded-full" />
            <Skeleton className="h-5 w-full max-w-[18rem] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-label-secondary hover:text-label-primary"
          onClick={props.onClick}
        >
          {props.icon}
          {props.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

function ContentLibraryArticleEditorShellInner(props: ContentLibraryArticleEditorShellProps) {
  const { t } = useTranslation(["content", "common"]);
  const { isHydrated } = useContentLibraryArticleEditorDocumentState();
  const scrollContainerRef = useEditorScrollRef();
  const [coverPopoverOpen, setCoverPopoverOpen] = React.useState(false);
  const [seoDialogOpen, setSeoDialogOpen] = React.useState(false);
  const showShellSkeleton = Boolean(props.isLoading);
  const showBodySkeleton = Boolean(props.isLoading) || !isHydrated;
  const textLaneClass =
    props.mode === "page"
      ? "mx-auto flex w-full max-w-[76rem] flex-col px-6"
      : "flex w-full flex-col px-4";
  const coverImageUrl = React.useMemo(
    () => resolveAssetRefToPublicUrlPath(props.coverAssetId),
    [props.coverAssetId],
  );

  return (
    <>
      <div
        className={cn(
          "relative flex h-full min-h-0 flex-col overflow-hidden bg-card",
          props.className,
        )}
      >
        {props.mode === "split" ? (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-card px-3">
            <div className="flex items-center gap-1">
              {props.onClose ? (
                <ToolbarIconButton
                  label={t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")}
                  onClick={props.onClose}
                >
                  <PanelRightClose className="size-4" />
                </ToolbarIconButton>
              ) : null}
              {props.onOpenPage ? (
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
                error={props.saveError}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  !props.hasPublishableVersion || props.isPublishing || props.saveState === "saving"
                }
                onClick={props.onPublish}
              >
                <Upload className="size-4" />
                {t("CONTENT_LIBRARY_ACTION_PUBLISH")}
              </Button>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild focusTrigger={false}>
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
                  </TooltipTrigger>
                  <TooltipContent>{t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}</TooltipContent>
                </Tooltip>
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
        ) : null}

        {props.mode === "page" ? (
          <ContentLibraryArticleEditorPageToolbar
            saveState={props.saveState}
            saveError={props.saveError}
            isPublishing={props.isPublishing}
            hasPublishableVersion={props.hasPublishableVersion}
            onPublish={props.onPublish}
            status={props.status}
            visibility={props.visibility}
            onVisibilityChange={props.onVisibilityChange}
            slug={props.slug}
            onSlugChange={props.onSlugChange}
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <div className="flex min-h-full w-full flex-col">
              {coverImageUrl ? (
                <div className="w-full">
                  <div className="group/cover relative overflow-hidden border-b border-border/70 bg-muted/20">
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
                        <Button type="button" size="sm" variant="secondary" className="h-9 px-3">
                          {t("CONTENT_LIBRARY_EDITOR_CHANGE_COVER")}
                        </Button>
                      </ContentLibraryCoverPickerPopover>
                    </div>
                  </div>
                </div>
              ) : null}

              {showShellSkeleton ? (
                <ContentLibraryArticleEditorLoadingSkeleton
                  mode={props.mode}
                  showHeaderSkeleton
                  bodyClassName={props.mode === "page" ? "mt-8" : "mt-5"}
                />
              ) : (
                <>
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
                      {!props.coverAssetId ? (
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
                            className="h-8 px-3 text-label-secondary hover:text-label-primary"
                          >
                            <ImagePlus className="size-4" />
                            {t("CONTENT_LIBRARY_EDITOR_ADD_COVER")}
                          </Button>
                        </ContentLibraryCoverPickerPopover>
                      ) : null}
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
                        "w-full appearance-none border-none bg-transparent p-0 font-semibold  tracking-[-0.045em] text-label-primary outline-none placeholder:text-label-tertiary",
                        props.mode === "page" ? "text-largetitle" : "text-title",
                      )}
                    />

                    <textarea
                      value={props.summary}
                      onChange={(event) => props.onSummaryChange(event.target.value)}
                      placeholder={t("CONTENT_LIBRARY_EDITOR_SUMMARY_PLACEHOLDER")}
                      className="field-sizing-content min-h-0 w-full resize-none overflow-hidden border-none bg-transparent p-0 text-body text-label-secondary outline-none placeholder:text-label-tertiary dark:bg-transparent"
                      rows={2}
                    />
                  </div>

                  <div
                    className={cn(
                      "flex min-h-0 flex-1 flex-col",
                      props.mode === "page" ? "mt-8" : "mt-5",
                    )}
                  >
                    {showBodySkeleton ? (
                      <ContentLibraryArticleEditorLoadingSkeleton mode={props.mode} />
                    ) : (
                      <ContentLibraryArticleEditorBody
                        placeholder={t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
                        mode={props.mode}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ContentLibraryArticleEditorSeoDialog
        open={seoDialogOpen}
        seo={props.seo}
        onOpenChange={setSeoDialogOpen}
        onSeoChange={props.onSeoChange}
      />
    </>
  );
}

export function ContentLibraryArticleEditorShell(props: ContentLibraryArticleEditorShellProps) {
  return (
    <ContentLibraryArticleEditorDocumentProvider
      workspaceId={props.workspaceId}
      editorIdentity={`${props.workspaceId}:${props.itemId}`}
      document={props.bodyDocument}
      onChange={props.onBodyDocumentChange}
    >
      <ContentLibraryArticleEditorShellInner {...props} />
    </ContentLibraryArticleEditorDocumentProvider>
  );
}
