import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEvent } from "@/types/api";
import { ActivityTimeline } from "@/pages/organization/activity/components/activity-timeline";
import { PageSkeleton } from "@celestial/ui/page-skeleton";
import { ContentGuard } from "@/components/common/content-guard";

type OrganizationMemberInspectActivityTabProps = {
  items: ActivityEvent[];
  loading: boolean;
  error: unknown;
  isFetchingNextPage: boolean;
  onRetry: () => void;
  onSelect: (event: ActivityEvent) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
};

export function OrganizationMemberInspectActivityTab({
  items,
  loading,
  error,
  isFetchingNextPage,
  onRetry,
  onSelect,
  scrollRef,
  sentinelRef,
}: OrganizationMemberInspectActivityTabProps) {
  const { t } = useTranslation(["activity"]);

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  return (
    <ContentGuard
      loading={false}
      error={error}
      onRetry={onRetry}
      empty={items.length === 0}
      emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
      emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
      variant="compact"
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-8">
        <ActivityTimeline items={items} onSelect={onSelect} loading={isFetchingNextPage} />
        <div ref={sentinelRef} className="h-10" />
      </div>
    </ContentGuard>
  );
}
