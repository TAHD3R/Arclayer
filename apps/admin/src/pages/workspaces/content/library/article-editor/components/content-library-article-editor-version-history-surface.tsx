import { useQuery } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listContentItemVersions } from "@/api/content";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
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
  workspaceId: string;
}) {
  const { t } = useTranslation("content");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: props.workspaceId });

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
  workspaceId: string;
}) {
  const { t } = useTranslation(["content", "common"]);
  const versionsQuery = useQuery({
    queryKey: ["content", "item", props.itemId, "versions"],
    enabled: props.open,
    queryFn: () => listContentItemVersions(props.workspaceId, props.itemId, { page: 1, size: 30 }),
    staleTime: 15_000,
  });
  const body = (
    <VersionHistoryList
      items={versionsQuery.data?.items ?? []}
      loading={versionsQuery.isLoading}
      workspaceId={props.workspaceId}
    />
  );

  if (props.mode === "split") {
    return (
      <SettingDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")}
        description={t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC")}
        contentClassName="sm:max-w-2xl"
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
        <DrawerHeader className="max-w-none px-6 py-4">
          <div className="flex items-center gap-2 text-label-primary">
            <HistoryIcon className="size-4" />
            <DrawerTitle>{t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")}</DrawerTitle>
          </div>
          <DrawerDescription>{t("CONTENT_LIBRARY_EDITOR_VERSION_HISTORY_DESC")}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none overflow-y-auto px-6 py-4">{body}</DrawerBody>
        <DrawerFooter className="max-w-none px-6 py-4">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CLOSE")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
