import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { listSystemActivity, type ActivityEvent } from "@/api/activity";

type UseOrganizationMemberInspectActivityParams = {
  enabled: boolean;
  userId: string | null;
};

type UseOrganizationMemberInspectActivityResult = {
  activityItems: ActivityEvent[];
  activityLoading: boolean;
  activityError: unknown;
  isFetchingNextActivityPage: boolean;
  activityScrollRef: RefObject<HTMLDivElement | null>;
  activitySentinelRef: RefObject<HTMLDivElement | null>;
  refetchActivity: () => void;
};

export function useOrganizationMemberInspectActivity({
  enabled,
  userId,
}: UseOrganizationMemberInspectActivityParams): UseOrganizationMemberInspectActivityResult {
  const activityScrollRef = useRef<HTMLDivElement | null>(null);
  const activitySentinelRef = useRef<HTMLDivElement | null>(null);

  const activityFrom = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const actorActivityQuery = useInfiniteQuery({
    queryKey: ["organization-member-inspect-activity", "actor", userId, activityFrom],
    enabled: enabled && Boolean(userId),
    queryFn: async ({ pageParam }) =>
      listSystemActivity({
        page: Number(pageParam) || 1,
        size: 20,
        actorUserId: userId ?? undefined,
        occurredFrom: activityFrom,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const subjectActivityQuery = useInfiniteQuery({
    queryKey: ["organization-member-inspect-activity", "subject", userId, activityFrom],
    enabled: enabled && Boolean(userId),
    queryFn: async ({ pageParam }) =>
      listSystemActivity({
        page: Number(pageParam) || 1,
        size: 20,
        subjectUserId: userId ?? undefined,
        occurredFrom: activityFrom,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const fetchNextActivityPage = useCallback(() => {
    if (actorActivityQuery.hasNextPage && !actorActivityQuery.isFetchingNextPage) {
      void actorActivityQuery.fetchNextPage();
    }
    if (subjectActivityQuery.hasNextPage && !subjectActivityQuery.isFetchingNextPage) {
      void subjectActivityQuery.fetchNextPage();
    }
  }, [
    actorActivityQuery.fetchNextPage,
    actorActivityQuery.hasNextPage,
    actorActivityQuery.isFetchingNextPage,
    subjectActivityQuery.fetchNextPage,
    subjectActivityQuery.hasNextPage,
    subjectActivityQuery.isFetchingNextPage,
  ]);

  const hasMoreActivity = Boolean(
    actorActivityQuery.hasNextPage || subjectActivityQuery.hasNextPage,
  );

  const isFetchingNextActivityPage =
    actorActivityQuery.isFetchingNextPage || subjectActivityQuery.isFetchingNextPage;

  useEffect(() => {
    if (!enabled) return;

    const root = activityScrollRef.current;
    const target = activitySentinelRef.current;
    if (!root || !target) return;
    if (!hasMoreActivity || isFetchingNextActivityPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasMoreActivity || isFetchingNextActivityPage) return;
        fetchNextActivityPage();
      },
      {
        root,
        rootMargin: "160px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, fetchNextActivityPage, hasMoreActivity, isFetchingNextActivityPage]);

  const activityItems = useMemo(() => {
    const map = new Map<string, ActivityEvent>();

    for (const page of actorActivityQuery.data?.pages ?? []) {
      for (const event of page.items ?? []) {
        map.set(event.id, event);
      }
    }

    for (const page of subjectActivityQuery.data?.pages ?? []) {
      for (const event of page.items ?? []) {
        map.set(event.id, event);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      String(b.occurredAt).localeCompare(String(a.occurredAt)),
    );
  }, [actorActivityQuery.data?.pages, subjectActivityQuery.data?.pages]);

  const activityLoading = actorActivityQuery.isLoading || subjectActivityQuery.isLoading;
  const activityError =
    activityItems.length === 0 ? actorActivityQuery.error || subjectActivityQuery.error : null;

  const refetchActivity = useCallback(() => {
    void actorActivityQuery.refetch();
    void subjectActivityQuery.refetch();
  }, [actorActivityQuery.refetch, subjectActivityQuery.refetch]);

  return {
    activityItems,
    activityLoading,
    activityError,
    isFetchingNextActivityPage,
    activityScrollRef,
    activitySentinelRef,
    refetchActivity,
  };
}
