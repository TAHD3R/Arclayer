import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { ItemGroup, ItemSeparator } from "@arclayer/ui/item";
import { Spinner } from "@arclayer/ui/spinner";
import { cn } from "@arclayer/lib/utils";

import type { ListStatus } from "../types";
import { useNotifications } from "../hooks/use-notifications";
import { NotificationList } from "./notification-list";

export function NotificationsView() {
  const n = useNotifications();
  const { t, status } = n;

  const canMarkAllRead = status === "unread";
  const showDevSeed = n.isDev && Boolean(n.workspaceId);

  const emptyTitle =
    status === "unread"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE")
      : status === "archived"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_TITLE")
        : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
  const emptyDescription =
    status === "unread"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC")
      : status === "archived"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_DESC")
        : t("NOTIFICATIONS_EMPTY_ALL_DESC");

  const action =
    !canMarkAllRead && !showDevSeed ? null : (
      <div className="flex items-center gap-2">
        {showDevSeed ? (
          <Button variant="outline" loading={n.isSeeding} onClick={() => void n.seedDemo()}>
            {t("NOTIFICATIONS_DEV_SEED")}
          </Button>
        ) : null}
        {canMarkAllRead ? (
          <Button
            disabled={!n.unreadItems.length || n.listQuery.isFetching}
            loading={n.listQuery.isFetching && !n.listQuery.isRefetching}
            onClick={() => void n.markAllRead()}
          >
            {t("NOTIFICATIONS_MARK_ALL_AS_READ")}
          </Button>
        ) : null}
      </div>
    );

  return (
    <DefaultPage title={t("NOTIFICATIONS_PAGE_TITLE")} action={action}>
      <ChromeTabs value={status} onValueChange={(next) => n.setStatus(next as ListStatus)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="unread">{t("NOTIFICATIONS_TAB_UNREAD")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="all">{t("NOTIFICATIONS_TAB_ALL")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="read">{t("NOTIFICATIONS_TAB_READ")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="archived">{t("NOTIFICATIONS_TAB_ARCHIVED")}</ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value={status}>
          <ContentGuard
            loading={n.listQuery.isLoading && !n.listQuery.data}
            loadingVariant="table"
            error={n.loadError}
            onRetry={n.loadError ? () => void n.listQuery.refetch() : undefined}
            empty={!n.loadError && !n.listQuery.isLoading && n.items.length === 0}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
          >
            <div className="space-y-4">
              <ItemGroup className={cn("rounded-lg border border-border bg-card")}>
                {status === "all" && n.unreadItems.length ? (
                  <div className="px-4 py-2 text-caption font-semibold text-label-secondary">
                    {t("NOTIFICATIONS_GROUP_UNREAD")}
                  </div>
                ) : null}

                <NotificationList
                  items={status === "all" ? n.unreadItems : n.items}
                  nowMs={n.nowMs}
                  isRead={false}
                  onNavigate={(item) => void n.navigateToTarget(item)}
                  onMarkRead={(item) => void n.markRead(item)}
                  onArchive={(item) => void n.archiveItem(item)}
                  onDelete={(item) => void n.removeItem(item)}
                />

                {status === "all" && n.readItems.length ? (
                  <>
                    {n.unreadItems.length ? <ItemSeparator className="my-0" /> : null}
                    <div className="px-4 py-2 text-caption font-semibold text-label-secondary">
                      {t("NOTIFICATIONS_GROUP_READ")}
                    </div>
                    <NotificationList
                      items={n.readItems}
                      nowMs={n.nowMs}
                      isRead
                      onNavigate={(item) => n.navigateToReadTarget(item)}
                      onArchive={(item) => void n.archiveItem(item)}
                      onDelete={(item) => void n.removeItem(item)}
                    />
                  </>
                ) : null}
              </ItemGroup>

              <div className="flex justify-center py-4">
                <div className="flex h-6 w-6 items-center justify-center">
                  {n.listQuery.isFetchingNextPage ? (
                    <Spinner className="size-4 text-label-secondary" />
                  ) : null}
                </div>
              </div>
              <div ref={n.sentinelRef} />
            </div>
          </ContentGuard>
        </ChromeTabsContent>
      </ChromeTabs>
    </DefaultPage>
  );
}
