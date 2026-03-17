import { useEffect, useMemo, useRef } from "react";

import { resolveRecentAssets, toRecentAssetSnapshot } from "@/lib/assets/assets-recent";
import { useAssetsRecentStore } from "@/stores/use-assets-recent-store";
import type { AssetMasonryItem } from "@/types/assets-masonry";

export function useAssetsRecentItems(params: {
  workspaceId: string | null | undefined;
  active: AssetMasonryItem | null;
  items: AssetMasonryItem[];
}) {
  const records = useAssetsRecentStore((state) => state.records);
  const recordRecent = useAssetsRecentStore((state) => state.record);
  const removeRecent = useAssetsRecentStore((state) => state.remove);
  const clearWorkspaceRecent = useAssetsRecentStore((state) => state.clearWorkspace);
  const lastRecordedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.workspaceId || !params.active) {
      lastRecordedKeyRef.current = null;
      return;
    }

    const nextKey = `${params.workspaceId}:${params.active.id}`;
    if (lastRecordedKeyRef.current === nextKey) return;
    lastRecordedKeyRef.current = nextKey;
    recordRecent({
      workspaceId: String(params.workspaceId),
      asset: toRecentAssetSnapshot(params.active),
    });
  }, [params.active, params.workspaceId, recordRecent]);

  const workspaceId = params.workspaceId ? String(params.workspaceId) : null;
  const recentAssets = useMemo(
    () =>
      resolveRecentAssets({
        records,
        items: params.items,
        workspaceId,
      }),
    [params.items, workspaceId, records],
  );

  return {
    recentAssets,
    removeRecentAsset: removeRecent,
    clearRecentAssets: () => {
      if (!workspaceId) return;
      clearWorkspaceRecent(workspaceId);
    },
  };
}
