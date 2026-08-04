import type { PlatformSessionInventoryItemOut } from "@arclayer/platform-openapi";

export function platformSessionExpiresAt(session: PlatformSessionInventoryItemOut): string {
  return new Date(session.inactivityExpiresAt) < new Date(session.absoluteExpiresAt)
    ? session.inactivityExpiresAt
    : session.absoluteExpiresAt;
}

export function isPlatformSessionExpired(
  session: PlatformSessionInventoryItemOut,
  now = Date.now(),
): boolean {
  return new Date(platformSessionExpiresAt(session)).getTime() <= now;
}

export function sortPlatformSessionsNewestFirst(
  sessions: readonly PlatformSessionInventoryItemOut[],
): PlatformSessionInventoryItemOut[] {
  return [...sessions].sort(
    (left, right) =>
      new Date(right.recentActivityAt).getTime() - new Date(left.recentActivityAt).getTime(),
  );
}
