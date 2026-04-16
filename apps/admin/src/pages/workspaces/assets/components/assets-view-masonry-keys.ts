const MASONRY_COLUMN_WIDTH = 260;
const MASONRY_GUTTER = 16;
const MASONRY_MIN_COLUMN_COUNT = 2;
const MASONRY_MAX_COLUMN_COUNT = 8;
const MASONRY_COLUMN_SWITCH_BUFFER_PX = 24;

function clampColumnCount(count: number) {
  return Math.max(MASONRY_MIN_COLUMN_COUNT, Math.min(MASONRY_MAX_COLUMN_COUNT, count));
}

function getMinimumWidthForColumnCount(count: number) {
  return count * (MASONRY_COLUMN_WIDTH + MASONRY_GUTTER) - MASONRY_GUTTER;
}

export function getAssetsMasonryItemKey(item: { key: string } | undefined, index: number): string {
  return item?.key ?? `missing:${index}`;
}

export function getAssetsMasonryDatasetKey(baseKey: string, orderedAssetIds: string[]): string {
  return `${baseKey}:${orderedAssetIds.join("|")}`;
}

export function getAssetsMasonryMaxColumnCount(
  width: number,
  previousCount?: number | null,
): number {
  if (!Number.isFinite(width) || width <= 0) {
    return clampColumnCount(previousCount ?? 5);
  }

  const rawCount = clampColumnCount(
    Math.floor((width + MASONRY_GUTTER) / (MASONRY_COLUMN_WIDTH + MASONRY_GUTTER)),
  );
  const stablePrevious =
    typeof previousCount === "number" ? clampColumnCount(previousCount) : undefined;

  if (!stablePrevious || rawCount === stablePrevious) return rawCount;

  if (rawCount > stablePrevious) {
    let nextCount = stablePrevious;
    for (let candidate = stablePrevious + 1; candidate <= rawCount; candidate += 1) {
      if (width < getMinimumWidthForColumnCount(candidate) + MASONRY_COLUMN_SWITCH_BUFFER_PX) {
        return nextCount;
      }
      nextCount = candidate;
    }
    return nextCount;
  }

  let nextCount = stablePrevious;
  for (let candidate = stablePrevious; candidate > rawCount; candidate -= 1) {
    if (width >= getMinimumWidthForColumnCount(candidate) - MASONRY_COLUMN_SWITCH_BUFFER_PX) {
      return nextCount;
    }
    nextCount = candidate - 1;
  }
  return clampColumnCount(nextCount);
}
