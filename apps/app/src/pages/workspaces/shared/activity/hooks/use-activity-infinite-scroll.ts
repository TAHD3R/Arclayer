import { useEffect } from "react";

type UseActivityInfiniteScrollOptions = {
  root: HTMLDivElement | null;
  target: HTMLDivElement | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  extraDeps?: ReadonlyArray<unknown>;
};

export function useActivityInfiniteScroll(options: UseActivityInfiniteScrollOptions) {
  const { root, target, hasNextPage, isFetchingNextPage, fetchNextPage, extraDeps = [] } = options;

  useEffect(() => {
    if (!root || !target) return;
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
      },
      {
        root,
        rootMargin: "200px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [root, target, hasNextPage, isFetchingNextPage, fetchNextPage, ...extraDeps]);
}
