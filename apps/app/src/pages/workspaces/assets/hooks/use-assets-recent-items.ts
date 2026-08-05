import { useEffect, useMemo, useRef } from "react";

import { resolveRecentAssets, toRecentAssetSnapshot } from "@/lib/assets/assets-recent";
import { useAssetsRecentStore } from "@/stores/use-assets-recent-store";
import type { AssetMasonryItem } from "@/types/assets-masonry";

export function useAssetsRecentItems(params: {
  projectId: string | null | undefined;
  active: AssetMasonryItem | null;
  items: AssetMasonryItem[];
}) {
  const records = useAssetsRecentStore((state) => state.records);
  const recordRecent = useAssetsRecentStore((state) => state.record);
  const removeRecent = useAssetsRecentStore((state) => state.remove);
  const clearProjectRecent = useAssetsRecentStore((state) => state.clearProject);
  const lastRecordedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.projectId || !params.active) {
      lastRecordedKeyRef.current = null;
      return;
    }

    const nextKey = `${params.projectId}:${params.active.id}`;
    if (lastRecordedKeyRef.current === nextKey) return;
    lastRecordedKeyRef.current = nextKey;
    recordRecent({
      projectId: String(params.projectId),
      asset: toRecentAssetSnapshot(params.active),
    });
  }, [params.active, params.projectId, recordRecent]);

  const projectId = params.projectId ? String(params.projectId) : null;
  const recentAssets = useMemo(
    () =>
      resolveRecentAssets({
        records,
        items: params.items,
        projectId,
      }),
    [params.items, projectId, records],
  );

  return {
    recentAssets,
    removeRecentAsset: removeRecent,
    clearRecentAssets: () => {
      if (!projectId) return;
      clearProjectRecent(projectId);
    },
  };
}
