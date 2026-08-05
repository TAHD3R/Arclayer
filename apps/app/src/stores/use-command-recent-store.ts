import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import type { RecentCommandRecord } from "@/lib/command/command-types";
import type { CommandRecentState } from "@/types/stores";

const MAX_RECENT_COMMANDS = 8;

function touchRecord(record: Omit<RecentCommandRecord, "visitedAt">): RecentCommandRecord {
  return {
    ...record,
    visitedAt: new Date().toISOString(),
  };
}

export const useCommandRecentStore = create<CommandRecentState>()(
  persist(
    (set) => ({
      records: [],
      record: (record) =>
        set((state) => {
          const next = touchRecord(record);
          return {
            records: [next, ...state.records.filter((item) => item.key !== next.key)].slice(
              0,
              MAX_RECENT_COMMANDS,
            ),
          };
        }),
      clear: () => set({ records: [] }),
    }),
    {
      name: STORAGE_KEYS.commandRecent,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
