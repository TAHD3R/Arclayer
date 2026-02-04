export type AssetSelectionState = {
  selectedIds: Set<string>;
  lastActiveId: string | null;
};

export function selectOnly(_state: AssetSelectionState, id: string): AssetSelectionState {
  return {
    selectedIds: new Set([id]),
    lastActiveId: id,
  };
}

export function toggleSelect(state: AssetSelectionState, id: string): AssetSelectionState {
  const next = new Set(state.selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return {
    selectedIds: next,
    lastActiveId: id,
  };
}

export function rangeSelect(
  state: AssetSelectionState,
  targetId: string,
  orderedIds: string[],
): AssetSelectionState {
  const anchor = state.lastActiveId;
  if (!anchor) return selectOnly(state, targetId);

  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return selectOnly(state, targetId);

  const [start, end] = a <= b ? [a, b] : [b, a];
  const range = orderedIds.slice(start, end + 1);
  return {
    selectedIds: new Set(range),
    lastActiveId: targetId,
  };
}

export function clearSelection(_state: AssetSelectionState): AssetSelectionState {
  return {
    selectedIds: new Set(),
    lastActiveId: null,
  };
}

/**
 * Convert a selection set into a stable array ordered by the current visible list order.
 *
 * This is useful for picker scenarios where we want deterministic output (e.g. insert multiple images
 * into a Markdown editor in the same order as they appear on screen).
 */
export function orderSelectedIds(selectedIds: ReadonlySet<string>, orderedIds: string[]): string[] {
  const out: string[] = [];
  for (const id of orderedIds) {
    if (selectedIds.has(id)) out.push(id);
  }
  const extra = Array.from(selectedIds).filter((id) => !orderedIds.includes(id));
  extra.sort();
  out.push(...extra);
  return out;
}

/**
 * Plain click behavior for the Masonry tiles:
 * - First click selects the item.
 * - Clicking again (single click, detail=1) on the ONLY selected item clears selection.
 * - For double-click, the second click has detail=2, and we should keep selection (so it won't flicker off).
 */
export function selectOrClearOnPlainClick(
  state: AssetSelectionState,
  id: string,
  clickDetail: number,
): AssetSelectionState {
  const detail = Number(clickDetail || 0);
  if (detail <= 1 && state.selectedIds.size === 1 && state.selectedIds.has(id)) {
    return clearSelection(state);
  }
  return selectOnly(state, id);
}
