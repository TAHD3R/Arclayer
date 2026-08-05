export type AgentThreadGroupingMode = "project" | "time";

export type AgentThreadTimeGroupKey =
  | "today"
  | "yesterday"
  | "previous-7-days"
  | "previous-30-days"
  | "older";

export type AgentThreadListEntry = Readonly<{
  id: string;
  index: number;
  archived: boolean;
  pinned: boolean;
  projectId: string | null;
  timestamp: Date;
}>;

export type AgentThreadGroup = Readonly<{
  key: string;
  kind: "pinned" | "project" | "time";
  projectId: string | null;
  timeKey: AgentThreadTimeGroupKey | null;
  entries: readonly AgentThreadListEntry[];
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_GROUP_ORDER: readonly AgentThreadTimeGroupKey[] = [
  "today",
  "yesterday",
  "previous-7-days",
  "previous-30-days",
  "older",
];

function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function resolveTimeGroup(timestamp: Date, now: Date): AgentThreadTimeGroupKey {
  const ageInDays = Math.max(0, localDayNumber(now) - localDayNumber(timestamp));
  if (ageInDays === 0) return "today";
  if (ageInDays === 1) return "yesterday";
  if (ageInDays <= 7) return "previous-7-days";
  if (ageInDays <= 30) return "previous-30-days";
  return "older";
}

function sortEntries(entries: readonly AgentThreadListEntry[]): readonly AgentThreadListEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.timestamp.getTime() - left.timestamp.getTime() || left.id.localeCompare(right.id),
  );
}

function groupByProject(entries: readonly AgentThreadListEntry[]): readonly AgentThreadGroup[] {
  const groups = new Map<string | null, AgentThreadListEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.projectId) ?? [];
    group.push(entry);
    groups.set(entry.projectId, group);
  }
  return Array.from(groups.entries())
    .map(([projectId, projectEntries]) => ({
      key: `project:${projectId ?? "workspace"}`,
      kind: "project" as const,
      projectId,
      timeKey: null,
      entries: projectEntries,
    }))
    .sort(
      (left, right) =>
        (right.entries[0]?.timestamp.getTime() ?? 0) - (left.entries[0]?.timestamp.getTime() ?? 0),
    );
}

function groupByTime(
  entries: readonly AgentThreadListEntry[],
  now: Date,
): readonly AgentThreadGroup[] {
  const groups = new Map<AgentThreadTimeGroupKey, AgentThreadListEntry[]>();
  for (const entry of entries) {
    const timeKey = resolveTimeGroup(entry.timestamp, now);
    const group = groups.get(timeKey) ?? [];
    group.push(entry);
    groups.set(timeKey, group);
  }
  return TIME_GROUP_ORDER.flatMap((timeKey) => {
    const timeEntries = groups.get(timeKey);
    return timeEntries
      ? [
          {
            key: `time:${timeKey}`,
            kind: "time" as const,
            projectId: null,
            timeKey,
            entries: timeEntries,
          },
        ]
      : [];
  });
}

export function groupAgentThreadEntries(
  entries: readonly AgentThreadListEntry[],
  now: Date,
  groupingMode: AgentThreadGroupingMode,
): readonly AgentThreadGroup[] {
  const sorted = sortEntries(entries);
  const pinnedEntries = sorted.filter((entry) => entry.pinned);
  const regularEntries = sorted.filter((entry) => !entry.pinned);
  const pinnedGroup: readonly AgentThreadGroup[] = pinnedEntries.length
    ? [
        {
          key: "pinned",
          kind: "pinned",
          projectId: null,
          timeKey: null,
          entries: pinnedEntries,
        },
      ]
    : [];
  const regularGroups =
    groupingMode === "project" ? groupByProject(regularEntries) : groupByTime(regularEntries, now);
  return [...pinnedGroup, ...regularGroups];
}
