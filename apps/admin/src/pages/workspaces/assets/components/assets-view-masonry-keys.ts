export function getAssetsMasonryItemKey(item: { key: string } | undefined, index: number): string {
  return item?.key ?? `missing:${index}`;
}

export function getAssetsMasonryDatasetKey(baseKey: string, orderedAssetIds: string[]): string {
  return `${baseKey}:${orderedAssetIds.join("|")}`;
}
