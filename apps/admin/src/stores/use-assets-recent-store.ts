import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  clearRecentAssetWorkspaceRecords,
  removeRecentAssetWorkspaceAssetIds,
  removeRecentAssetRecord,
  touchRecentAssetRecord,
  type RecentAssetRecord,
  type RecentAssetSnapshot,
} from "@/lib/assets/assets-recent";

const MAX_RECENT_ASSETS = 8;

type AssetsRecentState = {
  records: RecentAssetRecord[];
  record: (input: { workspaceId: string; asset: RecentAssetSnapshot }) => void;
  remove: (key: string) => void;
  removeAssets: (workspaceId: string, assetIds: string[]) => void;
  clearWorkspace: (workspaceId: string) => void;
};

export const useAssetsRecentStore = create<AssetsRecentState>()(
  persist(
    (set) => ({
      records: [],
      record: (input) =>
        set((state) => {
          return {
            records: touchRecentAssetRecord(state.records, input, MAX_RECENT_ASSETS),
          };
        }),
      remove: (key) =>
        set((state) => ({
          records: removeRecentAssetRecord(state.records, key),
        })),
      removeAssets: (workspaceId, assetIds) =>
        set((state) => ({
          records: removeRecentAssetWorkspaceAssetIds(state.records, workspaceId, assetIds),
        })),
      clearWorkspace: (workspaceId) =>
        set((state) => ({
          records: clearRecentAssetWorkspaceRecords(state.records, workspaceId),
        })),
    }),
    {
      name: STORAGE_KEYS.assetsRecent,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
