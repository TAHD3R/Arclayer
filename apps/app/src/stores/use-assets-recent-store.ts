import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  clearRecentAssetProjectRecords,
  removeRecentAssetProjectAssetIds,
  removeRecentAssetRecord,
  touchRecentAssetRecord,
  type RecentAssetRecord,
  type RecentAssetSnapshot,
} from "@/lib/assets/assets-recent";

const MAX_RECENT_ASSETS = 8;

type AssetsRecentState = {
  records: RecentAssetRecord[];
  record: (input: { projectId: string; asset: RecentAssetSnapshot }) => void;
  remove: (key: string) => void;
  removeAssets: (projectId: string, assetIds: string[]) => void;
  clearProject: (projectId: string) => void;
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
      removeAssets: (projectId, assetIds) =>
        set((state) => ({
          records: removeRecentAssetProjectAssetIds(state.records, projectId, assetIds),
        })),
      clearProject: (projectId) =>
        set((state) => ({
          records: clearRecentAssetProjectRecords(state.records, projectId),
        })),
    }),
    {
      name: STORAGE_KEYS.assetsRecent,
      storage: createJSONStorage(() => localStorage),
      version: 2,
    },
  ),
);
