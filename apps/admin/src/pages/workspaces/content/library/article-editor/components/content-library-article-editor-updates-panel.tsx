import * as React from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listWorkspaceActivity } from "@/api/activity";
import { ActivityTimeline } from "@/pages/workspaces/shared/activity/components/activity-timeline";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";

const CONTENT_ITEM_ACTIVITY_ENTITY_TYPE = "content_item";

export function ContentLibraryArticleEditorUpdatesPanel(props: {
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const { t } = useTranslation(["content", "common"]);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const updatesQuery = useInfiniteQuery({
    queryKey: ["activity", "content-item", props.workspaceId, props.itemId],
    enabled: props.open,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listWorkspaceActivity(props.workspaceId, {
        entityId: props.itemId,
        entityType: CONTENT_ITEM_ACTIVITY_ENTITY_TYPE,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: 20,
      }),
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !props.open) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (updatesQuery.isFetchingNextPage || !updatesQuery.hasNextPage) return;
      updatesQuery.fetchNextPage().catch(() => undefined);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [props.open, updatesQuery]);

  if (!props.open) return null;

  const items = (updatesQuery.data?.pages ?? []).flatMap((page) => page.items ?? []);

  return (
    <aside className="absolute inset-y-12 right-0 z-30 flex w-[28rem] flex-col border-l border-border/70 bg-card shadow-2xl">
      <ChromeTabs value="updates" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <ChromeTabsList className="w-auto">
            <ChromeTabsTrigger value="updates">
              {t("CONTENT_LIBRARY_EDITOR_MENU_ALL_UPDATES")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common:CLOSE")}
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <ChromeTabsContent value="updates" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 && !updatesQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/60 px-6 text-center text-footnote text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_UPDATES_EMPTY")}
            </div>
          ) : (
            <>
              <ActivityTimeline items={items} loading={updatesQuery.isFetchingNextPage} />
              <div ref={sentinelRef} className="h-8" />
            </>
          )}
        </ChromeTabsContent>
      </ChromeTabs>
    </aside>
  );
}
