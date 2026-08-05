import type { RecentCommandRecord } from "@/lib/command/command-types";

export interface CommandRecentState {
  records: RecentCommandRecord[];
  record: (record: Omit<RecentCommandRecord, "visitedAt">) => void;
  clear: () => void;
}
