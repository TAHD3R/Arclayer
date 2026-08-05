import { describe, expect, it } from "vitest";

import {
  groupAgentThreadEntries,
  type AgentThreadListEntry,
} from "@/components/ai/agent-thread-list-groups";

function entry(
  id: string,
  projectId: string | null,
  timestamp: string,
  index: number,
  pinned = false,
): AgentThreadListEntry {
  return {
    id,
    projectId,
    timestamp: new Date(timestamp),
    index,
    archived: false,
    pinned,
  };
}

const NOW = new Date("2026-08-05T12:00:00");

describe("groupAgentThreadEntries", () => {
  it("groups conversations by project and orders projects by recent activity", () => {
    const groups = groupAgentThreadEntries(
      [
        entry("project-a-older", "project-a", "2026-08-04T18:00:00", 0),
        entry("project-b", "project-b", "2026-08-05T09:00:00", 1),
        entry("project-a-newer", "project-a", "2026-08-05T11:00:00", 2),
        entry("workspace", null, "2026-07-10T12:00:00", 3),
      ],
      NOW,
      "project",
    );

    expect(groups.map((group) => [group.kind, group.projectId])).toEqual([
      ["project", "project-a"],
      ["project", "project-b"],
      ["project", null],
    ]);
    expect(groups[0]?.entries.map((item) => item.id)).toEqual([
      "project-a-newer",
      "project-a-older",
    ]);
  });

  it("groups conversations into stable ChatGPT-style time ranges", () => {
    const groups = groupAgentThreadEntries(
      [
        entry("today", "project-a", "2026-08-05T09:00:00", 0),
        entry("yesterday", "project-a", "2026-08-04T18:00:00", 1),
        entry("last-week", "project-b", "2026-07-30T12:00:00", 2),
        entry("last-month", null, "2026-07-10T12:00:00", 3),
        entry("older", null, "2026-06-01T12:00:00", 4),
      ],
      NOW,
      "time",
    );

    expect(groups.map((group) => group.timeKey)).toEqual([
      "today",
      "yesterday",
      "previous-7-days",
      "previous-30-days",
      "older",
    ]);
  });

  it("keeps pinned conversations in one leading group for either grouping mode", () => {
    const entries = [
      entry("regular-newer", "project-a", "2026-08-05T11:00:00", 0),
      entry("pinned", "project-b", "2026-08-04T18:00:00", 1, true),
    ];

    for (const mode of ["project", "time"] as const) {
      const groups = groupAgentThreadEntries(entries, NOW, mode);
      expect(groups[0]).toMatchObject({ kind: "pinned", key: "pinned" });
      expect(groups[0]?.entries.map((item) => item.id)).toEqual(["pinned"]);
    }
  });
});
