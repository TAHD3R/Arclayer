import type { PlatformDestination, PlatformDestinationId } from "@/capabilities/module-registry";

export type RecentDestination = Readonly<{
  destinationId: PlatformDestinationId;
  visitedAt: number;
}>;

const RECENT_DESTINATIONS_KEY = "arclayer:platform:recent-destinations";
const RECENT_DESTINATION_LIMIT = 8;
const TRUSTED_DESTINATION_IDS: ReadonlySet<string> = new Set<PlatformDestinationId>([
  "overview",
  "needs-attention",
  "access-team",
  "workspace-workspaces",
  "monitoring-requests",
  "monitoring-performance",
  "monitoring-ai-usage",
  "monitoring-activity",
  "monitoring-audit",
]);

function isRecentDestination(value: unknown): value is RecentDestination {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RecentDestination>;
  return (
    typeof record.destinationId === "string" &&
    TRUSTED_DESTINATION_IDS.has(record.destinationId) &&
    typeof record.visitedAt === "number" &&
    Number.isFinite(record.visitedAt) &&
    record.visitedAt > 0
  );
}

export function readRecentDestinations(
  storage: Pick<Storage, "getItem">,
  authorizedDestinations: readonly PlatformDestination[],
): readonly RecentDestination[] {
  const serialized = storage.getItem(RECENT_DESTINATIONS_KEY);
  if (!serialized) return [];
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed)) throw new Error("Invalid Platform recent destinations state");

  const authorizedIds = new Set(authorizedDestinations.map(({ id }) => id));
  if (!parsed.every(isRecentDestination)) {
    throw new Error("Invalid Platform recent destinations state");
  }
  return parsed
    .filter(({ destinationId }) => authorizedIds.has(destinationId))
    .sort((left, right) => right.visitedAt - left.visitedAt);
}

export function recordRecentDestination(
  storage: Pick<Storage, "getItem" | "setItem">,
  destination: PlatformDestination,
  authorizedDestinations: readonly PlatformDestination[],
  visitedAt = Date.now(),
): readonly RecentDestination[] {
  const existing = readRecentDestinations(storage, authorizedDestinations);
  const next = [
    { destinationId: destination.id, visitedAt },
    ...existing.filter(({ destinationId }) => destinationId !== destination.id),
  ].slice(0, RECENT_DESTINATION_LIMIT);
  storage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next));
  return next;
}

export function resolveRecentDestinations(
  records: readonly RecentDestination[],
  authorizedDestinations: readonly PlatformDestination[],
): readonly PlatformDestination[] {
  const byId = new Map(authorizedDestinations.map((destination) => [destination.id, destination]));
  return records.flatMap(({ destinationId }) => {
    const destination = byId.get(destinationId);
    return destination ? [destination] : [];
  });
}
