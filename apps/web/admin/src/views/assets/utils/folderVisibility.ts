/**
 * Folder visibility (client side):
 * - If we have confirmed "this folder has NO assets matching current filters", hide it.
 * - If the check is still loading/unknown (undefined), keep it visible to avoid UI flicker.
 */
export function filterFoldersByContentCheck<T extends { id: string }>(
  folders: readonly T[],
  hasMatchById: ReadonlyMap<string, boolean | undefined>,
): T[] {
  return folders.filter((f) => hasMatchById.get(String(f.id)) !== false);
}
