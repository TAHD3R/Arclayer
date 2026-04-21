import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, Maximize2, PanelRightClose, Search, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEditorScrollRef } from "platejs/react";

import { deleteContentItem, duplicateContentItem, patchContentItemWorkflow } from "@/api/content";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import {
  projectContentLibraryItemPath,
  projectContentLibraryPath,
} from "@/lib/routing/project-content-routing";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { buildContentLibraryItemsQueryKey } from "@/pages/projects/content/library/runtime";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { Button } from "@arclayer/ui/button";
import { Badge } from "@arclayer/ui/badge";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryArticleEditorBody } from "./content-library-article-editor-body";
import { getContentLibraryArticleEditorTextLaneClass } from "./content-library-article-editor-body";
import {
  ContentLibraryArticleEditorDocumentProvider,
  useContentLibraryArticleEditorDocumentState,
} from "./content-library-article-editor-document";
import { ContentLibraryCoverPickerPopover } from "./content-library-cover-picker-popover";
import { ContentLibraryArticleEditorMenuBar } from "./content-library-article-editor-menu";
import { ContentLibraryArticleEditorPageToolbar } from "./content-library-article-editor-page-toolbar";
import { ContentLibraryArticleEditorSaveIndicator } from "./content-library-article-editor-save-indicator";
import { ContentLibraryArticleEditorSeoDialog } from "./content-library-article-editor-seo-dialog";
import { ContentLibraryArticleEditorTocSidebar } from "./content-library-article-editor-toc-sidebar";
import { ContentLibraryArticleEditorDateLocalizationProvider } from "./content-library-article-editor-date-localization-provider";
import { ContentLibraryArticleEditorUpdatesPanel } from "./content-library-article-editor-updates-panel";
import { ContentLibraryArticleEditorVersionHistorySurface } from "./content-library-article-editor-version-history-surface";
import type { ContentLibraryArticleEditorRuntimeState } from "@/pages/projects/content/library/runtime";
import type { AdminContentItemPublishReadiness, AdminContentWorkflowStage } from "@/types/api";

const ARTICLE_EDITOR_PENDING_PANEL_STORAGE_KEY = "content-library-article-editor:pending-panel";
const WORKFLOW_TRANSITION_STAGES = ["in_review", "changes_requested", "approved"] as const;

type ContentLibraryArticleEditorShellProps = {
  projectId: string;
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
  onWorkflowUpdated?: (value: {
    publishReadiness?: AdminContentItemPublishReadiness | null;
    workflowAssigneeUserId?: string | null;
    workflowStage?: AdminContentWorkflowStage | null;
    workflowSummary?: string | null;
  }) => void;
  runtime: ContentLibraryArticleEditorRuntimeState;
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
        <div className={cn(getContentLibraryArticleEditorTextLaneClass(props.mode), "space-y-3")}>
          <Skeleton className="h-12 w-full max-w-[30rem] rounded-xl" />
          <Skeleton className="h-6 w-full max-w-[42rem] rounded-xl" />
          <Skeleton className="h-6 w-full max-w-[28rem] rounded-xl" />
        </div>
      ) : null}

      <div className={cn("flex min-h-0 flex-1 flex-col", props.showHeaderSkeleton ? "mt-8" : "")}>
        <div
          role="status"
          aria-live="polite"
          className={cn(getContentLibraryArticleEditorTextLaneClass(props.mode), "flex-1")}
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

function ArticleEditorRuntimeSummary(props: { runtime: ContentLibraryArticleEditorRuntimeState }) {
  const { t } = useTranslation("content");

  return (
    <div className="flex flex-wrap items-center gap-2 text-footnote text-label-secondary">
      <Badge variant="outline" className="h-7 rounded-full px-2.5">
        {t(`CONTENT_LIBRARY_STATUS_${props.runtime.currentView.toUpperCase()}`)}
      </Badge>
      {props.runtime.version.draftNumber ? (
        <span>
          {t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_VERSION", {
            version: props.runtime.version.draftNumber,
          })}
        </span>
      ) : null}
      {props.runtime.version.publishedNumber ? (
        <span>
          {t("CONTENT_LIBRARY_STATUS_PUBLISHED")} v{props.runtime.version.publishedNumber}
        </span>
      ) : null}
      {props.runtime.hasUnsavedChanges ? (
        <span>{t("CONTENT_LIBRARY_DIAGNOSTIC_HAS_DRAFT")}</span>
      ) : null}
      {props.runtime.diagnostics.map((diagnostic) => (
        <span key={diagnostic.id}>{t(diagnostic.labelKey)}</span>
      ))}
    </div>
  );
}

function ArticleEditorWorkflowLane(props: {
  disabled?: boolean;
  onTransition: (stage: (typeof WORKFLOW_TRANSITION_STAGES)[number]) => void;
  pending?: boolean;
  runtime: ContentLibraryArticleEditorRuntimeState;
}) {
  const { t } = useTranslation("content");
  const readiness = props.runtime.workflow.publishReadiness;
  const blockerCodes = readiness?.blockerCodes ?? [];

  return (
    <div className="border-b border-border/70 bg-muted/20 px-4 py-3 md:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-2.5">
              {t(`CONTENT_LIBRARY_WORKFLOW_STAGE_${props.runtime.workflow.stage.toUpperCase()}`)}
            </Badge>
            <span className="text-footnote text-label-secondary">
              {readiness?.ready
                ? t("CONTENT_LIBRARY_WORKFLOW_READY")
                : t("CONTENT_LIBRARY_WORKFLOW_NEEDS_REVIEW")}
            </span>
          </div>
          <p className="mt-1 truncate text-footnote text-label-secondary">
            {props.runtime.workflow.summary ||
              (blockerCodes.length > 0
                ? t("CONTENT_LIBRARY_WORKFLOW_BLOCKED_BY", { count: blockerCodes.length })
                : t("CONTENT_LIBRARY_WORKFLOW_LANE_DESC"))}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {WORKFLOW_TRANSITION_STAGES.map((stage) => (
            <Button
              key={stage}
              type="button"
              variant={props.runtime.workflow.stage === stage ? "default" : "outline"}
              size="sm"
              disabled={props.disabled || props.pending || props.runtime.workflow.stage === stage}
              onClick={() => props.onTransition(stage)}
            >
              {t(`CONTENT_LIBRARY_WORKFLOW_ACTION_${stage.toUpperCase()}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContentLibraryArticleEditorShellInner(props: ContentLibraryArticleEditorShellProps) {
  const { t } = useTranslation(["content", "common"]);
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isHydrated } = useContentLibraryArticleEditorDocumentState();
  const scrollContainerRef = useEditorScrollRef();
  const [coverPopoverOpen, setCoverPopoverOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [seoDialogOpen, setSeoDialogOpen] = React.useState(false);
  const [updatesOpen, setUpdatesOpen] = React.useState(false);
  const showShellSkeleton = Boolean(props.isLoading);
  const showBodySkeleton = Boolean(props.isLoading) || !isHydrated;
  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canPublish = !permissionReady || permissionAccess.hasAction("release:publish");
  const publishAccessHint = canPublish ? null : t("CONTENT_LIBRARY_PUBLISH_NO_ACCESS_DESC");
  const textLaneClass = getContentLibraryArticleEditorTextLaneClass(props.mode);
  const coverImageUrl = React.useMemo(
    () => resolveAssetRefToPublicUrlPath(props.coverAssetId),
    [props.coverAssetId],
  );
  React.useEffect(() => {
    if (props.mode !== "page" || typeof window === "undefined") return;
    const pendingPanel = window.sessionStorage.getItem(ARTICLE_EDITOR_PENDING_PANEL_STORAGE_KEY);
    if (pendingPanel !== `${props.projectId}:${props.itemId}:updates`) return;
    window.sessionStorage.removeItem(ARTICLE_EDITOR_PENDING_PANEL_STORAGE_KEY);
    setUpdatesOpen(true);
  }, [props.itemId, props.mode, props.projectId]);
  const duplicateMutation = useMutation({
    mutationFn: async () => duplicateContentItem(props.projectId, props.itemId),
    onSuccess: async (nextItem) => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DUPLICATE_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(props.projectId),
      });
      await navigate({
        to: projectContentLibraryItemPath(props.projectId, nextItem.id),
      });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteContentItem(props.projectId, props.itemId);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DELETE_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(props.projectId),
      });
      if (props.mode === "split") {
        props.onClose?.();
        return;
      }
      await navigate({
        to: projectContentLibraryPath(props.projectId),
      } as never);
    },
    onError: (error) => notifyError(error),
  });
  const workflowMutation = useMutation({
    mutationFn: async (stage: (typeof WORKFLOW_TRANSITION_STAGES)[number]) =>
      patchContentItemWorkflow(props.projectId, props.itemId, {
        stage,
        summary: t(`CONTENT_LIBRARY_WORKFLOW_SUMMARY_${stage.toUpperCase()}`),
      }),
    onSuccess: async (item) => {
      props.onWorkflowUpdated?.({
        publishReadiness: item.publishReadiness ?? null,
        workflowAssigneeUserId: item.workflowAssigneeUserId ?? null,
        workflowStage: item.workflowStage ?? null,
        workflowSummary: item.workflowSummary ?? null,
      });
      notifySuccessText(t("CONTENT_LIBRARY_WORKFLOW_UPDATE_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(props.projectId),
      });
    },
    onError: (error) => notifyError(error),
  });
  const handleOpenUpdates = React.useCallback(async () => {
    if (props.mode === "page") {
      setUpdatesOpen(true);
      return;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        ARTICLE_EDITOR_PENDING_PANEL_STORAGE_KEY,
        `${props.projectId}:${props.itemId}:updates`,
      );
    }
    await navigate({
      to: projectContentLibraryItemPath(props.projectId, props.itemId),
    });
  }, [navigate, props.itemId, props.mode, props.projectId]);

  return (
    <>
      <div
        className={cn(
          "relative flex h-full min-h-0 flex-col overflow-hidden bg-card",
          props.className,
        )}
      >
        {props.mode === "split" ? (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-card px-4 md:px-5">
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
              <ContentLibraryArticleEditorSaveIndicator runtime={props.runtime} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  !canPublish ||
                  !props.runtime.hasPublishableVersion ||
                  props.runtime.isPublishing ||
                  props.runtime.saveState === "saving"
                }
                title={publishAccessHint ?? undefined}
                onClick={props.onPublish}
              >
                <Upload className="size-4" />
                {t("CONTENT_LIBRARY_ACTION_PUBLISH")}
              </Button>
              <ContentLibraryArticleEditorMenuBar
                itemTitle={props.title}
                mode="split"
                onDelete={() => deleteMutation.mutate()}
                onDuplicate={() => duplicateMutation.mutate()}
                onImportDocument={(value) => props.onBodyDocumentChange?.(value)}
                onOpenAllUpdates={() => {
                  void handleOpenUpdates();
                }}
                status={props.status}
                visibility={props.visibility}
                onOpenVersionHistory={() => setHistoryOpen(true)}
                onVisibilityChange={props.onVisibilityChange}
                slug={props.slug}
                onSlugChange={props.onSlugChange}
                onCloseSplit={props.onClose}
                onOpenPageEditor={props.onOpenPage}
                onOpenSeo={() => setSeoDialogOpen(true)}
              />
            </div>
          </div>
        ) : null}

        {props.mode === "page" ? (
          <ContentLibraryArticleEditorPageToolbar
            canPublish={canPublish}
            itemTitle={props.title}
            publishAccessHint={publishAccessHint}
            saveState={props.runtime.saveState}
            saveError={props.runtime.saveError}
            isPublishing={props.runtime.isPublishing}
            hasPublishableVersion={props.runtime.hasPublishableVersion}
            onDelete={() => deleteMutation.mutate()}
            onDuplicate={() => duplicateMutation.mutate()}
            onImportDocument={(value) => props.onBodyDocumentChange?.(value)}
            onOpenAllUpdates={() => {
              void handleOpenUpdates();
            }}
            onPublish={props.onPublish}
            status={props.status}
            visibility={props.visibility}
            onOpenVersionHistory={() => setHistoryOpen(true)}
            onVisibilityChange={props.onVisibilityChange}
            slug={props.slug}
            onSlugChange={props.onSlugChange}
            onOpenSeo={() => setSeoDialogOpen(true)}
          />
        ) : null}

        <ArticleEditorWorkflowLane
          disabled={!canPublish}
          onTransition={(stage) => workflowMutation.mutate(stage)}
          pending={workflowMutation.isPending}
          runtime={props.runtime}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollContainerRef}
            data-article-editor-scroll-root="true"
            data-plate-selectable="true"
            className="relative flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain scroll-pb-32"
          >
            <div data-plate-selectable="true" className="flex min-h-full w-full flex-col">
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
                        workspaceId={props.projectId}
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
              ) : props.mode === "page" ? (
                <div
                  className={cn(
                    "mx-auto flex w-full max-w-[90rem] items-start gap-8 px-6 pb-10 pt-2 xl:gap-10",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className={cn("group/header", textLaneClass, "pt-4", "space-y-3")}>
                      <ArticleEditorRuntimeSummary runtime={props.runtime} />
                      <div className="flex h-8 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100">
                        {!props.coverAssetId ? (
                          <ContentLibraryCoverPickerPopover
                            workspaceId={props.projectId}
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
                          "w-full appearance-none border-none bg-transparent p-0 font-semibold text-label-primary outline-none placeholder:text-label-tertiary",
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

                    <div className="mt-6 flex w-full flex-col">
                      {showBodySkeleton ? (
                        <ContentLibraryArticleEditorLoadingSkeleton mode={props.mode} />
                      ) : (
                        <ContentLibraryArticleEditorBody
                          placeholder={t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
                          mode={props.mode}
                        />
                      )}
                    </div>
                  </div>

                  <ContentLibraryArticleEditorTocSidebar mode="page" />
                </div>
              ) : (
                <div className="relative pb-8">
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "group/header",
                        textLaneClass,
                        props.coverAssetId ? "pt-4" : "pt-6",
                        "space-y-3",
                      )}
                    >
                      <ArticleEditorRuntimeSummary runtime={props.runtime} />
                      <div className="flex h-8 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100">
                        {!props.coverAssetId ? (
                          <ContentLibraryCoverPickerPopover
                            workspaceId={props.projectId}
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
                          "w-full appearance-none border-none bg-transparent p-0 font-semibold text-label-primary outline-none placeholder:text-label-tertiary",
                          "text-title",
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

                    <div className="mt-4 flex w-full flex-col">
                      {showBodySkeleton ? (
                        <ContentLibraryArticleEditorLoadingSkeleton mode={props.mode} />
                      ) : (
                        <ContentLibraryArticleEditorBody
                          placeholder={t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
                          mode={props.mode}
                        />
                      )}
                    </div>
                  </div>

                  <div className="absolute right-4 top-4 z-20">
                    <ContentLibraryArticleEditorTocSidebar mode="split" />
                  </div>
                </div>
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
      <ContentLibraryArticleEditorVersionHistorySurface
        itemId={props.itemId}
        mode={props.mode}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        workspaceId={props.projectId}
      />
      {props.mode === "page" ? (
        <ContentLibraryArticleEditorUpdatesPanel
          itemId={props.itemId}
          open={updatesOpen}
          onOpenChange={setUpdatesOpen}
          runtime={props.runtime}
          workspaceId={props.projectId}
        />
      ) : null}
    </>
  );
}

export function ContentLibraryArticleEditorShell(props: ContentLibraryArticleEditorShellProps) {
  return (
    <ContentLibraryArticleEditorDocumentProvider
      workspaceId={props.projectId}
      editorIdentity={`${props.projectId}:${props.itemId}`}
      document={props.bodyDocument}
      onChange={props.onBodyDocumentChange}
    >
      <ContentLibraryArticleEditorDateLocalizationProvider workspaceId={props.projectId}>
        <ContentLibraryArticleEditorShellInner {...props} />
      </ContentLibraryArticleEditorDateLocalizationProvider>
    </ContentLibraryArticleEditorDocumentProvider>
  );
}
