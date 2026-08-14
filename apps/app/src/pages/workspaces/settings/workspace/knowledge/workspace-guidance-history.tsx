import { useMemo, useState } from "react";
import { Ellipsis, Eye, History, Power, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { KnowledgeGuidanceRevisionOut } from "@arclayer/openapi";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { cn } from "@arclayer/lib/utils";

import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";
import { WorkspaceGuidancePlatePreview } from "./workspace-guidance-plate-editor";

export function GuidanceHistory({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const date = useRevisionDate();

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="guidance-history-title"
    >
      <h2 id="guidance-history-title" className="text-title3 font-semibold text-label-primary">
        {t("HISTORY_TITLE")}
      </h2>
      <p className="mt-1 max-w-2xl text-footnote text-label-secondary">
        {t("HISTORY_DESCRIPTION")}
      </p>
      <RevisionHistoryContent
        controller={controller}
        date={date}
        showRestore
        onView={controller.setDetailRevision}
      />
      <LoadMoreHistory controller={controller} />
    </section>
  );
}

export function WorkspaceKnowledgeHistoryDrawer(props: {
  controller: WorkspaceGuidanceController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("knowledge");
  const date = useRevisionDate();

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent
        className="w-full max-w-[32rem]"
        overlayClassName="backdrop-blur-sm"
        showCloseButton={false}
      >
        <DrawerHeader className="max-w-none px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <DrawerTitle unstyled className="min-w-0 flex-1 font-bold text-headline">
              {t("HISTORY_DRAWER_TITLE")}
            </DrawerTitle>
            <DrawerClose asChild>
              <Button size="icon-sm" variant="ghost" aria-label={t("common:CLOSE")}>
                <X />
              </Button>
            </DrawerClose>
          </div>
          <DrawerDescription>{t("HISTORY_DRAWER_DESCRIPTION")}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none overflow-y-auto p-2">
          <RevisionHistoryContent
            controller={props.controller}
            date={date}
            showRestore
            onView={props.controller.setDetailRevision}
          />
          <LoadMoreHistory controller={props.controller} inDrawer />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function RevisionHistoryContent(props: {
  controller: WorkspaceGuidanceController;
  date: Intl.DateTimeFormat;
  showRestore?: boolean;
  onView?: (revision: KnowledgeGuidanceRevisionOut) => void;
}) {
  const { t } = useTranslation("knowledge");

  return (
    <ContentGuard
      className="mt-5"
      loading={props.controller.historyQuery.isLoading}
      error={props.controller.historyQuery.error}
      onRetry={() => void props.controller.historyQuery.refetch()}
      loadingVariant="form"
    >
      {props.controller.history.length ? (
        <div className="space-y-1 px-1 py-1">
          {props.controller.history.map((revision) => (
            <RevisionRow
              key={revision.id}
              revision={revision}
              date={props.date}
              restorePending={props.controller.restorePreviewMutation.isPending}
              removePending={props.controller.removePreviewMutation.isPending}
              showRestore={props.showRestore ?? false}
              currentRevisionId={props.controller.layer?.currentPublished?.id}
              removedAt={props.controller.layer?.removedAt}
              onView={() => props.onView?.(revision)}
              onRestore={() => void props.controller.previewRestore(revision)}
              onRemove={() => void props.controller.previewRemoval()}
            />
          ))}
        </div>
      ) : (
        <Empty className="min-h-40 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("HISTORY_EMPTY_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("HISTORY_EMPTY_DESCRIPTION")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </ContentGuard>
  );
}

function LoadMoreHistory(props: { controller: WorkspaceGuidanceController; inDrawer?: boolean }) {
  const { t } = useTranslation("knowledge");
  if (!props.controller.historyQuery.hasNextPage) return null;

  return (
    <Button
      className={cn("mt-4", props.inDrawer && "w-full")}
      variant={props.inDrawer ? "ghost" : "outline"}
      loading={props.controller.historyQuery.isFetchingNextPage}
      onClick={() => void props.controller.historyQuery.fetchNextPage()}
    >
      {t("HISTORY_LOAD_MORE")}
    </Button>
  );
}

function useRevisionDate() {
  const { i18n } = useTranslation("knowledge");
  return useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );
}

function RevisionRow(props: {
  revision: KnowledgeGuidanceRevisionOut;
  date: Intl.DateTimeFormat;
  restorePending: boolean;
  showRestore: boolean;
  currentRevisionId?: string;
  removedAt?: string | null;
  removePending: boolean;
  onRestore: () => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const [menuOpen, setMenuOpen] = useState(false);
  const canRestore = props.revision.status !== "draft";
  const isCurrent = props.revision.id === props.currentRevisionId;
  const canSwitch = canRestore && !isCurrent;
  const canRemove = isCurrent && !props.removedAt;
  const createdAt = props.revision.createdAt
    ? props.date.format(new Date(props.revision.createdAt))
    : t("DATE_UNAVAILABLE");

  return (
    <div
      aria-current={isCurrent ? "true" : undefined}
      data-menu-open={menuOpen ? "true" : undefined}
      className={cn(
        "group flex w-full min-w-0 items-start gap-2.5 rounded-md px-3 py-3 transition-[background-color,box-shadow,opacity] duration-150 hover:bg-accent/40 active:bg-accent/60 data-[menu-open=true]:bg-accent/60 data-[menu-open=true]:ring-1 data-[menu-open=true]:ring-inset data-[menu-open=true]:ring-border/70",
        menuOpen && "bg-accent/60 ring-1 ring-inset ring-border/70",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-headline font-semibold text-label-primary">
            {t("REVISION_DETAIL", { revision: props.revision.revisionNumber })}
          </span>
          {isCurrent ? (
            <Badge variant="default" className="shrink-0 px-2.5 py-1 text-caption leading-4">
              {t("REVISION_CURRENT")}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 break-words overflow-hidden whitespace-pre-wrap text-footnote leading-5 text-label-secondary">
          {props.revision.content}
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-footnote text-label-secondary">
            <span className="truncate">{createdAt}</span>
          </div>
          {props.showRestore ? (
            <div
              className={cn(
                "flex shrink-0 gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
                menuOpen && "opacity-100",
              )}
            >
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("HISTORY_SWITCH_ACTION")}
                disabled={!canSwitch || props.restorePending || props.removePending}
                loading={props.restorePending}
                onClick={props.onRestore}
              >
                <RotateCcw />
              </Button>
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t("HISTORY_VERSION_OPTIONS", {
                      revision: props.revision.revisionNumber,
                    })}
                    className="data-[state=open]:bg-accent data-[state=open]:text-label-primary"
                    disabled={props.restorePending || props.removePending}
                    onClick={() => {
                      if (!menuOpen) setMenuOpen(true);
                    }}
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={props.onView}>
                    <Eye data-icon="inline-start" />
                    {t("HISTORY_VIEW_ACTION")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!canSwitch || props.restorePending || props.removePending}
                    onSelect={props.onRestore}
                  >
                    <Power data-icon="inline-start" />
                    {t("ENABLE_ACTION")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={
                      isCurrent ? !canRemove || props.restorePending || props.removePending : true
                    }
                    onSelect={isCurrent ? props.onRemove : undefined}
                  >
                    <Trash2 data-icon="inline-start" />
                    {isCurrent
                      ? t("HISTORY_REMOVE_CURRENT_ACTION")
                      : t("HISTORY_DELETE_UNAVAILABLE")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceGuidanceRevisionDialog(props: {
  revision: KnowledgeGuidanceRevisionOut | null;
  onOpenChange: (revision: KnowledgeGuidanceRevisionOut | null) => void;
}) {
  const { t } = useTranslation("knowledge");

  return (
    <AlertDialog
      open={Boolean(props.revision)}
      onOpenChange={(open) => {
        if (!open) props.onOpenChange(null);
      }}
    >
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("REVISION_DETAIL", { revision: props.revision?.revisionNumber ?? 0 })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("HISTORY_PREVIEW_DESCRIPTION")}</AlertDialogDescription>
        </AlertDialogHeader>
        {props.revision ? (
          <WorkspaceGuidancePlatePreview
            ariaLabel={t("HISTORY_PREVIEW_CONTENT_LABEL")}
            value={props.revision.content}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RevisionStatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation("knowledge");
  const label =
    status === "published"
      ? t("REVISION_PUBLISHED")
      : status === "superseded"
        ? t("REVISION_SUPERSEDED")
        : t("REVISION_DRAFT");
  const variant =
    status === "published" ? "default" : status === "superseded" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
