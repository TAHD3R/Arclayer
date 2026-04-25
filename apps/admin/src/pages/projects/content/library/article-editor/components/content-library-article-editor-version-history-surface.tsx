import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompareIcon, HistoryIcon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  compareContentItemVersions,
  restoreContentItemVersion,
  type AdminContentVersionCompare,
} from "@/api/content";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  buildContentLibraryItemsQueryKey,
  buildContentLibraryVersionHistoryQueryKey,
  loadContentLibraryVersionHistory,
} from "@/pages/projects/content/library/runtime";
import type { AdminContentVersion } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Skeleton } from "@arclayer/ui/skeleton";
import { cn } from "@arclayer/lib/utils";

function VersionHistoryList(props: {
  items: AdminContentVersion[];
  loading: boolean;
  projectId: string;
  itemId: string;
}) {
  const { t } = useTranslation("content");
  const dateTime = useAdminDateTimeFormatter({ projectId: props.projectId });
  const queryClient = useQueryClient();
  const [compareResult, setCompareResult] = React.useState<AdminContentVersionCompare | null>(null);
  const compareMutation = useMutation({
    mutationFn: async (item: AdminContentVersion) =>
      compareContentItemVersions(
        props.projectId,
        props.itemId,
        Math.max(1, item.versionNumber - 1),
        item.versionNumber,
      ),
    onSuccess: (data) => setCompareResult(data),
    onError: (error) => notifyError(error),
  });
  const restoreMutation = useMutation({
    mutationFn: async (item: AdminContentVersion) =>
      restoreContentItemVersion(props.projectId, props.itemId, item.versionNumber),
    onSuccess: async () => {
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_VERSION_RESTORE_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: buildContentLibraryVersionHistoryQueryKey(props.projectId, props.itemId),
        }),
        queryClient.invalidateQueries({
          queryKey: buildContentLibraryItemsQueryKey(props.projectId),
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  if (props.loading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border/70 bg-card px-4 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-3 w-48" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (props.items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/60 px-6 text-center text-footnote text-label-secondary">
        {t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_EMPTY")}
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {props.items.map((item) => (
        <article
          key={item.versionNumber}
          className="rounded-xl border border-border/70 bg-card px-4 py-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-callout font-semibold text-label-primary">
              {t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_VERSION", {
                version: item.versionNumber,
              })}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-caption font-medium",
                item.state === "published"
                  ? "bg-emerald-500/10 text-emerald-700"
                  : item.state === "archived"
                    ? "bg-muted text-label-secondary"
                    : "bg-blue-500/10 text-blue-700",
              )}
            >
              {t(`CONTENT_LIBRARY_STATUS_${item.state.toUpperCase()}`)}
            </span>
          </div>
          <div className="mt-2 text-footnote text-label-secondary">
            {dateTime.formatDateTime(item.createdAt)}
          </div>
          <div className="mt-3 text-footnote text-label-primary">
            {item.changeSummary || t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_NO_SUMMARY")}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={item.versionNumber <= 1 || compareMutation.isPending}
              onClick={() => compareMutation.mutate(item)}
            >
              <GitCompareIcon className="size-4" />
              {t("CONTENT_LIBRARY_EDITOR_VERSION_COMPARE")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(item)}
            >
              <RotateCcwIcon className="size-4" />
              {t("CONTENT_LIBRARY_EDITOR_VERSION_RESTORE")}
            </Button>
          </div>
          {compareResult?.targetVersionNumber === item.versionNumber ? (
            <div className="mt-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-footnote text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_VERSION_COMPARE_CHANGES", {
                count: compareResult.changes.length,
              })}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ContentLibraryArticleEditorVersionHistorySurface(props: {
  itemId: string;
  mode: "page" | "split";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const { t } = useTranslation(["content", "common"]);
  const versionsQuery = useQuery({
    queryKey: buildContentLibraryVersionHistoryQueryKey(props.projectId, props.itemId),
    enabled: props.open,
    queryFn: () => loadContentLibraryVersionHistory(props.projectId, props.itemId),
    staleTime: 15_000,
  });
  const body = (
    <VersionHistoryList
      items={versionsQuery.data?.items ?? []}
      loading={versionsQuery.isLoading}
      itemId={props.itemId}
      projectId={props.projectId}
    />
  );

  if (props.mode === "split") {
    return (
      <SettingDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")}
        description={t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC")}
        footer={
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CLOSE")}
          </Button>
        }
      >
        {body}
      </SettingDialog>
    );
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full max-w-[32rem]">
        <DrawerHeader className="max-w-none px-6 py-5">
          <div className="flex items-center gap-2 text-label-primary">
            <HistoryIcon className="size-4" />
            <DrawerTitle>{t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")}</DrawerTitle>
          </div>
          <DrawerDescription>{t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC")}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none overflow-y-auto px-6 py-5">{body}</DrawerBody>
        <DrawerFooter className="max-w-none px-6 py-5">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CLOSE")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
