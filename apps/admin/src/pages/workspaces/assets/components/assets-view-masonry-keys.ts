export function getAssetsMasonryItemKey(item: { key: string } | undefined, index: number): string {
  return item?.key ?? `missing:${index}`;
}

export function getAssetsMasonryDatasetKey(baseKey: string, orderedAssetIds: string[]): string {
  return `${baseKey}:${orderedAssetIds.join("|")}`;
}

export function getAssetsMasonryMaxColumnCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 5;
  const columnWidth = 260;
  const gutter = 16;
  const nextCount = Math.floor((width + gutter) / (columnWidth + gutter));
  return Math.max(2, Math.min(8, nextCount));
}
